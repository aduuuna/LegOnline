import * as SecureStore from "expo-secure-store";

const EXTENSION_KEY = "legonline_extension";
const PASSWORD_KEY = "legonline_password";

export interface SavedCredentials {
  extension: string;
  password: string;
}

export async function saveCredentials(extension: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(EXTENSION_KEY, extension);
  await SecureStore.setItemAsync(PASSWORD_KEY, password);
}

export async function loadCredentials(): Promise<SavedCredentials | null> {
  const [extension, password] = await Promise.all([
    SecureStore.getItemAsync(EXTENSION_KEY),
    SecureStore.getItemAsync(PASSWORD_KEY),
  ]);
  if (!extension || !password) return null;
  return { extension, password };
}

export async function clearCredentials(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(EXTENSION_KEY),
    SecureStore.deleteItemAsync(PASSWORD_KEY),
  ]);
}
