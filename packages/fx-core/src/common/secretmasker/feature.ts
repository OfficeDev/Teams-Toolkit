// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { dictMatcher } from "./dict";

export function combinations1(keys: string[]): string[] {
  const expandedKeys: string[] = [];
  keys.forEach((key) => {
    if (key.endsWith("password")) {
      expandedKeys.push(key.substring(0, key.length - 4));
    }
    expandedKeys.push(key);
  });

  keys = expandedKeys;

  let results: string[] = [];
  results = results.concat(keys);

  keys.forEach((key) => {
    if (key.includes("_")) {
      const key1 = key.split("_").join("");
      const key2 = key.split("_").join("-");
      results.push(key1);
      results.push(key2);
    }
  });
  return Array.from(new Set(results)).sort();
}

export function combinations2(keys: string[]): string[] {
  let results: string[] = [];
  results = results.concat(keys);
  keys.forEach((key) => {
    results.push("-" + key);
    results.push("--" + key);
  });
  return Array.from(new Set(results)).sort();
}

export const CredKeywordsEndsWith: string[] = combinations1([
  "access_key",
  "access_token",
  "account_key",
  "aci_token",
  "ad_password",
  "admin_key",
  "admin_password",
  "admin_token",
  "api_key",
  "api_key_id",
  "api_secret",
  "api_token",
  "app_key",
  "app_secret",
  "application_token",
  "auth_code",
  "auth_header",
  "auth_key",
  "auth_password",
  "auth_secret",
  "auth_token",
  "authenti",
  "authorization",
  "aws_access_key_id",
  "aws_key",
  "aws_secret_access_key",
  "azure_cr",
  "azure_secret",
  "backup_key",
  "bank_account_key",
  "basic_auth",
  "bearer_token",
  "billing_key",
  "cert_id",
  "card_key",
  "cert_password",
  "certificate",
  "client_certificate",
  "client_id",
  "client_key",
  "client_secret",
  "cloud_key",
  "connection_secret",
  "connection_string",
  "consumer_id",
  "consumer_key",
  "consumer_secret",
  "cookie_secret",
  "credential",
  "crypt_key",
  "customer_key",
  "data_encryption_key",
  "db_password",
  "db_secret",
  "db_user",
  "decryption_key",
  "device_key",
  "digital_signature",
  "disk_encryption_key",
  "docker_token",
  "dropbox_token",
  "encryption_cert",
  "encryption_key",
  "encryption_password",
  "encryption_password_key",
  "encryption_secret",
  "env_key",
  "firewall_password",
  "ftp_password",
  "ftp_user",
  "gcp_credentials",
  "gcp_key",
  "gcp_private_key",
  "git_token",
  "gitlab_token",
  "gpg_key",
  "hash_key",
  "hipaa_key",
  "hmac_key",
  "http_password",
  "iam_access_key",
  "id_token",
  "install_key",
  "integration_key",
  "ipsec_key",
  "jira_token",
  "kerberos_key",
  "key",
  "keystore_password",
  "kms_key",
  "kube_config",
  "kubernetes_token",
  "ldap_bind_password",
  "ldap_password",
  "ldap_secret",
  "license_key",
  "login_key",
  "mac_key",
  "machine_key",
  "management_certificate",
  "master_key",
  "merchant_key",
  "mfa_key",
  "mysql_password",
  "oauth_id",
  "oauth_secret",
  "oauth_token",
  "oracle_wallet_password",
  "otp_key",
  "passphrase",
  "password",
  "paypal_secret",
  "pci_key",
  "pem_key",
  "pfx_password",
  "pg_password",
  "pgp_key",
  "pre_shared_key",
  "preshared_key",
  "private_cert",
  "private_encryption_key",
  "private_key",
  "private_key_password",
  "private_password",
  "private_ssh_key",
  "private_token",
  "proxy_password",
  "rds_password",
  "recovery_cert",
  "recovery_key",
  "recovery_password",
  "redis_password",
  "registry_key",
  "registry_password",
  "repo_token",
  "rsa_private_key",
  "s3_key",
  "salt_key",
  "saml_key",
  "sas_key",
  "sas_token",
  "secret",
  "secret_access_key",
  "secret_id",
  "secret_key_base",
  "secure_string",
  "security_key",
  "security_token",
  "sensitive_data_key",
  "server_key",
  "service_account",
  "session_key",
  "session_secret",
  "session_token",
  "sftp_password",
  "shared_access_key",
  "sign_in_key",
  "sign_key",
  "signing_cert",
  "signing_key",
  "signing_secret",
  "slack_token",
  "smtp_password",
  "smtp_secret",
  "social_security_key",
  "ssh_cert",
  "ssh_key",
  "ssl_certificate",
  "ssl_key",
  "storage_account_key",
  "storage_key",
  "subscription_key",
  "tfa_key",
  "third_party_key",
  "tls_key",
  "tls_secret",
  "token",
  "token_key",
  "token_secret",
  "tpm_key",
  "travis_token",
  "trust_password",
  "truststore_password",
  "trust_store_password",
  "two_factor_auth",
  "two_factor_key",
  "upload_token",
  "user_key",
  "user_pass",
  "user_secret",
  "username_password",
  "validation_key",
  "vault_cert",
  "vault_password",
  "vault_token",
  "vcenter_password",
  "vcs_token",
  "vpn_key",
  "vpn_password",
  "web_auth_secret",
  "webauthn_secret",
  "webhook_secret",
  "wifi_password",
  "windows_password",
  "windows_secret",
  "wpa_password",
  "x-functions-key",
  "x509c",
  "yubikey_password",
]);

export const CredKeywordsEquals: string[] = combinations2([
  "p",
  "auth",
  "bearer",
  "code",
  "creds",
  "dapi",
  "encrypt",
  "jwt",
  "pat",
  "pin",
  "pw",
  "pwd",
  "sas",
  "sig",
  "sign_in",
]);

// console.log(JSON.stringify(CredKeywordsEndsWith, null, 2));

function extractCharFeatures(token: string) {
  let alphabetNum = 0;
  let numberNum = 0;
  let upperCaseNum = 0;
  let lowerCaseNum = 0;
  let specialCharNum = 0;
  const frequency: Record<string, number> = {};
  for (const char of token) {
    if (char >= "0" && char <= "9") {
      numberNum++;
    } else if ((char >= "a" && char <= "z") || (char >= "A" && char <= "Z")) {
      if (char >= "a" && char <= "z") {
        lowerCaseNum++;
      } else {
        upperCaseNum++;
      }
      alphabetNum++;
    } else {
      specialCharNum++;
    }
    frequency[char] = (frequency[char] || 0) + 1;
  }
  const length = token.length;
  const entropy = -Object.values(frequency).reduce((acc, freq) => {
    const p = freq / length;
    return acc + p * Math.log2(p);
  }, 0);
  const specialCharRatio = specialCharNum / token.length;
  const charDiversity = Object.keys(frequency).length / token.length;
  let charCatDiversity = 0;
  if (alphabetNum > 0) charCatDiversity++;
  if (numberNum > 0) charCatDiversity++;
  if (specialCharNum > 0) charCatDiversity++;
  if (upperCaseNum > 0) charCatDiversity++;
  if (lowerCaseNum > 0) charCatDiversity++;
  return {
    specialCharRatio,
    charDiversity,
    charCatDiversity,
    entropy,
  };
}

// Helper function to check if a token contains common secret-related keywords
function containsSecretKeywords(token: string): number {
  if (CredKeywordsEndsWith.some((keyword) => token.toLowerCase().endsWith(keyword))) return 1;
  if (CredKeywordsEquals.some((keyword) => token.toLowerCase() === keyword)) return 1;
  return 0;
}

export interface SplitterToken {
  type: "splitter";
  token: string;
}

export interface FeatureToken {
  type: "feature";
  token: string;
  vector?: number[];
  label?: number;
  predict?: number;
}

export type Token = SplitterToken | FeatureToken;

export function tokenize(input: string): Token[] {
  // Regular expression to match JSON-specific delimiters and whitespace
  const tokens: string[] = input.split(/(\s+|[{}[\],:"=;])/).filter((t) => t.length > 0); // Retain and filter out empty tokens

  // Map the tokens into an array of Token objects
  return tokens.map((t) => {
    if (/\s+/.test(t) || /[{}[\],:"=;]/.test(t)) {
      return {
        type: "splitter",
        token: t,
      };
    } else {
      return {
        type: "feature",
        token: t,
      };
    }
  });
}

export function extractFeatures(text: string): Token[] {
  const allTokens = tokenize(text);
  const featureTokens = allTokens.filter((t) => t.type === "feature");
  for (let i = 0; i < featureTokens.length; i++) {
    const tokenObj = featureTokens[i];
    let token = tokenObj.token;

    if (token.endsWith("<secret>")) {
      token = token.slice(0, -8);
      tokenObj.label = 1;
    } else {
      tokenObj.label = 0;
    }

    // check if the previous token contains secret keyword
    let preIndicator = 0;

    if (i - 2 >= 0) {
      const preToken = featureTokens[i - 1].token;
      const prePreToken = featureTokens[i - 2].token;
      if (containsSecretKeywords(preToken) === 1 || containsSecretKeywords(prePreToken) === 1) {
        preIndicator = 1;
      }
    } else if (i - 1 >= 0) {
      const preToken = featureTokens[i - 1].token;
      if (containsSecretKeywords(preToken) === 1) {
        preIndicator = 1;
      }
    }

    const dictMatchRes = dictMatcher.match(token);
    const isDictWord = dictMatchRes === "exact" || dictMatchRes === "contains" ? 1 : 0;
    const { specialCharRatio, charDiversity, entropy, charCatDiversity } =
      extractCharFeatures(token);
    tokenObj.vector = [
      entropy, // 0
      specialCharRatio ? 1 : 0, // 1
      charDiversity, //2
      charCatDiversity, //3
      isDictWord, //4
      preIndicator, //5
    ];
  }
  return allTokens;
}
