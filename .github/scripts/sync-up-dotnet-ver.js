const fse = require("fs-extra");
const { resolve } = require("path");
const path = require("path")
const semver = require("semver")
const targetPkgName = process.argv[2];
const targetPath = path.join(__dirname, "../../packages", targetPkgName);
const xml2js = require(path.join(targetPath, "node_modules/xml2js"))
// ---- target pkg name and version -----
const pkgName = require(path.join(targetPath, 'package.json')).name;
const pkgVer = require(path.join(targetPath, "package.json")).version;
console.log("========= pkg name:", pkgName, " pkg version: ", pkgVer);
// parse csproj file as XML
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

// update target(simpleauth or function-extension) csproj file
async function updateCurrentCSprojVer(csprojFile) {
    const file = await fse.readFile(csprojFile);
    const result = await parseXml(file);
    for (let prop of result['Project'].PropertyGroup) {
        if (prop.Version) {
            prop.Version[0] = pkgVer;
            break;
        }
    }
    // convert JSON objec to XML
    const builder = new xml2js.Builder({ trim: true, headless: true });
    const xml = builder.buildObject(result);
    // write updated XML string to a file
    await fse.writeFile(csprojFile, xml)
}

// only to sync up templates version with function-extension.
async function syncUpTemplateVer(targetFile) {
    const file = await fse.readFile(targetFile, 'utf-8');
    const result = await parseXml(file);
    let changed = false;
    for (let prop of result['Project'].ItemGroup) {
        if (!prop.PackageReference)
            continue;
        for (let item of prop.PackageReference) {
            if (item.$.Include != 'Microsoft.Azure.WebJobs.Extensions.TeamsFx')
                continue;
            let ver = item.$.Version;
            if (!semver.intersects(ver, pkgVer)) {
                changed = true;
                item.$.Version = pkgVer
            }
        }
    }
    if (changed) {
        const builder = new xml2js.Builder({ trim: true, headless: true });
        const xml = builder.buildObject(result);
        await fse.writeFile(targetFile, xml);
    }
    return new Promise((resolve) => {resolve(changed)});
};

// if templates deps has changed, need to bump up templates version.
async function bumpUpTargetPkgVer(changed, targetPkgPath) {
    // only alpha and stable release bump up version
    let needBumpUp = process.argv[3] === "yes" ? true : false;
    console.log('version changed? ', changed, ' need bump up ', needBumpUp)
    if (changed && needBumpUp) {
        console.log('bump up template version syncup with function extension')
        let file = path.join(targetPkgPath, "package.json");
        let pkg_ = await fse.readJson(file);
        let ver = pkg_.version;
        if (semver.prerelease(pkgVer)) {
            ver = semver.inc(ver, "prerelease", "alpha");
        } else {
            ver = semver.inc(ver, "patch");
        }

        pkg_.version = ver;
        await fse.writeFile(file, JSON.stringify(pkg_, null, 4));

        file = path.join(targetPkgPath, "package-lock.json");
        if (file) {
            pkg_ = await fse.readJson(file);
            pkg_.version = ver;
            await fse.writeFile(file, JSON.stringify(pkg_, null, 4))
        }

        console.log("bump up templates version as ", ver);
    }
}

// simpleauth need to update fx-core simpleauth version file
async function updateFxCoreSimpleAuthVer(simpleauthVer, targetPkgPath) {
    const simpleauthVerTxt = path.join(targetPkgPath, "./templates/plugins/resource/simpleauth/version.txt")
    const version = await fse.readFile(simpleauthVerTxt, "utf8");
    let changed = false;
    if(version != simpleauthVer) {
        changed = true;
        await fse.writeFile(simpleauthVerTxt, simpleauthVer, "utf8")
    }
    return new Promise((resolve) => {resolve(changed)});
}

async function updateSimpleAuth() {
    const synup = process.env.SkipSyncup;
    const csprojFile = path.join(targetPath, "src/TeamsFxSimpleAuth/Microsoft.TeamsFx.SimpleAuth.csproj");
    await updateCurrentCSprojVer(csprojFile);
    if (synup && synup.includes("fx-core")) {
        return;
    }
    // ---- fx-core pkg path -----
    const fxCorePath = path.join(__dirname, "../../packages/fx-core");
    const changed = await updateFxCoreSimpleAuthVer(pkgVer, fxCorePath);
    // simpleauth always need to bump up templates version since version text changed.
    await bumpUpTargetPkgVer(changed, fxCorePath);
}

// uopdate template csproj file
async function updateExtension() {
    const synup = process.env.SkipSyncup
    const templatePath = path.join(__dirname, "../../templates")
    const targetJsCsprojFile = path.join(templatePath, "function-base/js/default/extensions.csproj")
    const targetTsCsprojFile = path.join(templatePath, "function-base/ts/default/extensions.csproj")
    const csprojFile = path.join(targetPath, "src/Microsoft.Azure.WebJobs.Extensions.TeamsFx.csproj")
    await updateCurrentCSprojVer(csprojFile)
    if (synup && synup.includes("fx-core")) {
        return;
    }
    let changed = true;
    for (let targetFile of [targetJsCsprojFile, targetTsCsprojFile]) {
        changed = changed && await syncUpTemplateVer(targetFile);
    }
    // ---- templates relative path -----
    bumpUpTargetPkgVer(changed, templatePath);
}

async function main() {
    if (targetPkgName === "simpleauth") {
        await updateSimpleAuth();
    }
    else if (targetPkgName === "function-extension") {
        await updateExtension();
    }
}

main();