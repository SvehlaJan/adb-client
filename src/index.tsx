import {
  Form,
  ActionPanel,
  Action,
  showToast,
  getPreferenceValues,
  PreferenceValues,
  Toast,
  Detail,
  popToRoot,
  showHUD,
  LocalStorage,
  useNavigation,
} from "@raycast/api";
import { execaCommand } from "execa";
import { useState, useEffect } from "react";
import * as fs from "fs";

const KEY_ADB_ACTIONS = "adb_actions";
const KEY_ADB_EXTRA_PARAMS = "adb_extra_params";
const KEY_MESSAGE_HISTORY = "message_history";
const ERROR_MESSAGE_INPUT_EMPTY = "Input can't be empty";

type Error = {
  title: string;
  message: string;
};

function getAdbDir(): string {
  const preferences = getPreferenceValues<PreferenceValues>();
  const adbDir = preferences["adbDir"];
  if (adbDir) {
    return adbDir;
  }

  const home = process.env.HOME;
  return `${home}/Library/Android/sdk/platform-tools`;
}

function existsAdb(): boolean {
  const adbDir = getAdbDir();
  const adbPath = `${adbDir}/adb`;
  const adbExists = fs.existsSync(adbPath);
  console.log(`adb exists: ${adbExists}, path: ${adbPath}, dir: ${adbDir}`);
  return adbExists;
}

async function getDevices(): Promise<string[]> {
  const adbDir = getAdbDir();
  const { stdout } = await execaCommand(`${adbDir}/adb devices`, { cwd: adbDir });

  const devices: string[] = [];

  stdout.split("\n").forEach((line, index) => {
    if (index != 0 && line.length > 0) {
      devices.push(line.split("\t")[0]);
    }
  });
  return devices;
}

async function addValueToLocalStorage(key: string, value: string): Promise<void> {
  const valuesJsonStr = await LocalStorage.getItem<string>(key);
  const values = JSON.parse(valuesJsonStr || "[]");

  const index = values.indexOf(value);
  if (index != -1) {
    values.splice(index, 1);
  }
  values.unshift(value);

  const valuesJsonStrNew = JSON.stringify(values);
  await LocalStorage.setItem(key, valuesJsonStrNew);
}

function AddAdbActionScreen() {
  const [error, setError] = useState<string | undefined>(ERROR_MESSAGE_INPUT_EMPTY);

  async function handleSubmit(values: Form.Values) {
    await addValueToLocalStorage(KEY_ADB_ACTIONS, values["adb_action"]);
    popToRoot();
  }

  function validateInput(input: string) {
    if (input.length == 0) {
      setError("Value can't be empty");
    } else {
      setError(undefined);
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Send" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="adb_action"
        title="ADB Action"
        placeholder="android.intent.action.VIEW"
        error={error}
        onChange={(newValue) => {
          validateInput(newValue);
        }}
      />
    </Form>
  );
}

function AddAdbExtraStringParamScreen() {
  const [error, setError] = useState<string | undefined>(ERROR_MESSAGE_INPUT_EMPTY);

  async function handleSubmit(values: Form.Values) {
    await addValueToLocalStorage(KEY_ADB_EXTRA_PARAMS, values["adb_extra_string_param"]);
    popToRoot();
  }

  function validateInput(input: string) {
    if (input.length == 0) {
      setError("Value can't be empty");
    } else {
      setError(undefined);
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Send" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="adb_extra_string_param"
        title="ADB Extra String Param"
        placeholder="EAN"
        error={error}
        onChange={(newValue) => {
          validateInput(newValue);
        }}
      />
    </Form>
  );
}

interface UserInputValues {
  message: string;
}

export default function Command(props: { draftValues?: UserInputValues }) {
  const { draftValues } = props;

  const { push } = useNavigation();

  const [devices, setDevices] = useState<string[]>([]);
  const [adb_actions, setAdbActions] = useState<string[]>([]);
  const [adb_extra_params, setAdbExtraParams] = useState<string[]>([]);
  const [message_history, setMessageHistory] = useState<string[]>([]);
  const [error, setError] = useState<Error>();
  const [isLoading, setLoading] = useState<boolean>(true);

  async function handleSubmit(values: Form.Values) {
    const selectedMessage = values["message_history"];
    const newMessage = values["new_message"];
    const adbAction = values["adb_action"];
    const adbExtraParam = values["adb_extra_param"];
    const device = values["device"];

    const message = newMessage || selectedMessage;

    if (!message) {
      showToast({
        title: "Error",
        message: "Message is empty.",
        style: Toast.Style.Failure,
      });
      return;
    }
    if (!device) {
      showToast({
        title: "Error",
        message: "Device is not selected.",
        style: Toast.Style.Failure,
      });
      return;
    }

    await addValueToLocalStorage(KEY_MESSAGE_HISTORY, message);

    const excapedText = message.replace(" ", "%s").replace("\\", "\\\\");
    const args = `-s ${device} shell am broadcast -a "${adbAction}" --es ${adbExtraParam} "${excapedText}"`;

    const adbDir = getAdbDir();

    showToast({
      title: "Sending...",
      style: Toast.Style.Animated,
    });

    const command = `${adbDir}/adb ${args}`;
    console.log(command);
    execaCommand(command, { cwd: adbDir })
      .then(() => {
        popToRoot({ clearSearchBar: true });
        showHUD("Complete!");
      })
      .catch((e) => {
        showToast({
          title: "Error",
          message: e.message,
          style: Toast.Style.Failure,
        });
      });
  }

  useEffect(() => {
    if (!existsAdb()) {
      setError({
        title: "adb command not found!",
        message: "Please check the adb directory path. See `Raycast Preferences > Extensions > Run Android ADB Input`.",
      });
      return;
    }

    (async () => {
      const toast = await showToast({
        title: "Searching for devices...",
        style: Toast.Style.Animated,
      });

      try {
        const devices = await getDevices();
        if (devices.length == 0) {
          setError({
            title: "No devices found!",
            message: "Please connect device and re-run.",
          });
        } else {
          setDevices(devices);
        }

        const adbActionsJsonStr = await LocalStorage.getItem<string>(KEY_ADB_ACTIONS);
        setAdbActions(JSON.parse(adbActionsJsonStr || "[]"));
        const adb_extra_string_params = await LocalStorage.getItem<string>(KEY_ADB_EXTRA_PARAMS);
        setAdbExtraParams(JSON.parse(adb_extra_string_params || "[]"));
        const message_history = await LocalStorage.getItem<string>(KEY_MESSAGE_HISTORY);
        setMessageHistory(JSON.parse(message_history || "[]"));

        setLoading(false);
      } catch (e) {
        setError({
          title: "Unknown error!",
          message: `${e}`,
        });
      }

      toast.hide();
    })();
  }, []);

  if (error) {
    const markdown = `# ${error.title}\n\n${error.message}`;
    return <Detail markdown={markdown} />;
  } else if (devices.length > 0) {
    return (
      <Form
        enableDrafts
        isLoading={isLoading}
        actions={
          <ActionPanel>
            <Action.SubmitForm title="Send" onSubmit={handleSubmit} />
            <Action title="Add ADB Action" onAction={() => push(<AddAdbActionScreen />)} />
            <Action title="Add ADB Extra Param" onAction={() => push(<AddAdbExtraStringParamScreen />)} />
            <Action title="Clear local storage" onAction={async () => LocalStorage.clear()} />
          </ActionPanel>
        }
      >
        <Form.Description text="This form showcases all available form elements." />

        <Form.Dropdown
          id="message_history"
          title="Message"
        >
          {message_history.map((message, index) => (
            <Form.Dropdown.Item key={index} value={message} title={message} />
          ))}
        </Form.Dropdown>

        <Form.TextField
          id="new_message"
          title="New message"
          defaultValue={draftValues?.message}
        />

        <Form.Separator />

        <Form.Dropdown id="adb_action" title="Action">
          {adb_actions.map((adb_action, index) => (
            <Form.Dropdown.Item key={index} value={adb_action} title={adb_action} />
          ))}
        </Form.Dropdown>
        <Form.Dropdown id="adb_extra_param" title="Extra string param key">
          {adb_extra_params.map((adb_extra_param, index) => (
            <Form.Dropdown.Item key={index} value={adb_extra_param} title={adb_extra_param} />
          ))}
        </Form.Dropdown>
        <Form.Dropdown id="device" title="Device">
          {devices.map((device, index) => (
            <Form.Dropdown.Item key={index} value={device} title={device} />
          ))}
        </Form.Dropdown>
      </Form>
    );
  } else {
    return <Detail markdown="# Searching for devices..." />;
  }
}
