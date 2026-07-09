const minimist = require("minimist");

const argv = minimist(process.argv.slice(2));

if (argv.clientId === undefined) {
  process.exit(1);
} else {
  console.warn(
    `\nYou need to grant tenant-wide admin consent to the application in Entra ID\nUse this link to provide the consent\nhttps://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/${argv.clientId}/isMSAApp~/false`
  );
}
