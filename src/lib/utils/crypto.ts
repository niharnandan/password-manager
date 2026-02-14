import { browser } from "$app/environment";
import nacl from "tweetnacl";
import util from "tweetnacl-util";

const NONCE_BYTES = nacl.secretbox.nonceLength;
const KEY_BYTES = nacl.secretbox.keyLength;

export const stringToSalt = (saltStr: string): Uint8Array =>
  util.decodeBase64(saltStr);

export const deriveKey = (password: string, salt: Uint8Array): Uint8Array => {
  if (!browser)
    throw new Error("Crypto operations can only be performed in the browser");

  const passwordBytes = util.decodeUTF8(password);
  const material = new Uint8Array(passwordBytes.length + salt.length);
  material.set(passwordBytes);
  material.set(salt, passwordBytes.length);

  return nacl.hash(material).slice(0, KEY_BYTES);
};

export const encrypt = (
  data: string,
  key: Uint8Array,
): { ciphertext: string; nonce: string } => {
  if (!browser)
    throw new Error("Crypto operations can only be performed in the browser");

  const nonce = nacl.randomBytes(NONCE_BYTES);
  const messageBytes = util.decodeUTF8(data);
  const ciphertext = nacl.secretbox(messageBytes, nonce, key);

  return {
    ciphertext: util.encodeBase64(ciphertext),
    nonce: util.encodeBase64(nonce),
  };
};

export const decrypt = (
  ciphertext: string,
  nonce: string,
  key: Uint8Array,
): string | null => {
  if (!browser)
    throw new Error("Crypto operations can only be performed in the browser");

  const ciphertextBytes = util.decodeBase64(ciphertext);
  const nonceBytes = util.decodeBase64(nonce);
  const decrypted = nacl.secretbox.open(ciphertextBytes, nonceBytes, key);

  if (!decrypted) return null;
  return util.encodeUTF8(decrypted);
};
