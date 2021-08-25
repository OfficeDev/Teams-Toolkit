const fse = require("fs-extra");
const path = require("path")
const semver = require("semver")
const extensionPath = path.join(__dirname, "../../packages/function-extension");
const xml2js = require(path.join(extensionPath, "node_modules/xml2js"))

const extensionName = require(path.join(extensionPath, 'package.json')).name;
const extensionVer = require(path.join(extensionPath, "package.json")).version;
const csprojFile = path.join(extensionPath, "src/Microsoft.Azure.WebJobs.Extensions.TeamsFx.csproj")

const templatePath = path.join(__dirname, "../../templates")
const targetJsCsprojFile = path.join(templatePath, "function-base/js/default/extensions.csproj")
const targetTsCsprojFile = path.join(templatePath, "function-base/ts/default/extensions.csproj")
console.log("===== ", extensionName, " version: ", extensionVer);

function parseXml(xml) {
    return new Promise((resolve, reject) => {
        xml2js.parseString(xml, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}
async function updateCurrentCSprojVer() {
    const file = fse.readFileSync(csprojFile);
    const result = await parseXml(file);
    for (let prop of result['Project'].PropertyGroup) {
        if (prop.Version) {
            prop.Version[0] = extensionVer;
            break;
        }
    }
    // convert SJON objec to XML
    const builder = new xml2js.Builder({ trim: true, headless: true });
    const xml = builder.buildObject(result);
    // write updated XML string to a file
    fse.writeFileSync(csprojFile, xml, (err) => {
        if (err) {
            throw err;
        }
        console.log(`Updated XML is written to a new file.`);
    });
}

let changed = false;
async function syncUpTemplateVer(targetFile) {
    const file = fse.readFileSync(targetFile, 'utf-8');
    const result = await parseXml(file);
    for (let prop of result['Project'].ItemGroup) {
        if (!prop.PackageReference)
            continue;
        for (let item of prop.PackageReference) {
            if (item.$.Include != 'Microsoft.Azure.WebJobs.Extensions.TeamsFx')
                continue;
            let ver = item.$.Version;
            console.log("=============== csproj file version is ", ver)
            if (!semver.intersects(ver, extensionVer)) {
                changed = true;
                console.log('changed!')
                item.$.Version = extensionVer
            }

        }
    }
    if (!changed)
        return;
    const builder = new xml2js.Builder({ trim: true, headless: true });
    const xml = builder.buildObject(result);
    fse.writeFileSync(targetFile, xml, (err) => {
        if (err) {
            throw err;
        }
        console.log(`Updated XML is written to a new file.`);
    });
};

function bumpupTemplateVer() {
    // only alpha and stable release bump up version
    let needBumpUp = process.argv[2] === "yes" ? true : false;
    console.log('changed ', changed, ' need bump up ', needBumpUp)
    if (changed && needBumpUp) {
        console.log('bump up template version syncup with function extension')
        let file = path.join(templatePath, "package.json");
        let pkg_ = fse.readJsonSync(file);
        let ver = pkg_.version;
        if (semver.prerelease(extensionVer)) {
            ver = semver.inc(ver, "prerelease", "alpha");
        } else {
            ver = semver.inc(ver, "patch");
        }

        pkg_.version = ver;
        fse.writeFileSync(file, JSON.stringify(pkg_, null, 4));

        file = path.join(templatePath, "package-lock.json");
        if (file) {
            pkg_ = fse.readJsonSync(file);
            pkg_.version = ver;
            fse.writeFileSync(file, JSON.stringify(pkg_, null, 4))
        }

        console.log("bump up templates version as ", ver);
    }
}

async function main() {
    await updateCurrentCSprojVer();

    const synup = process.env.SkipSyncup
    if (synup && synup.includes("templates")) {
        return;
    }
    for (let targetFile of [targetJsCsprojFile, targetTsCsprojFile]) {
        await syncUpTemplateVer(targetFile);
    }
    bumpupTemplateVer();
}

main();