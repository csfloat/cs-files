const SteamUser = require('steam-user');
const fs = require('fs');
const vpk = require('vpk');
const iconv = require('iconv-lite');
const appId = 730;
const depotId = 2347770;
const dir = `./static`;
const temp = "./temp";
const manifestIdFile = 'manifestId.txt'

const vpkFiles = [
    'resource/csgo_english.txt',
    'scripts/items/items_game.txt',
    'scripts/items/items_game_cdn.txt',
];

async function downloadVPKDir(user, manifest) {
    const dirFile = manifest.manifest.files.find((file) => file.filename.endsWith("csgo\\pak01_dir.vpk"));

    console.log(`Downloading vpk dir`)

    await user.downloadFile(appId, depotId, dirFile, `${temp}/pak01_dir.vpk`);
    
    vpkDir = new vpk(`${temp}/pak01_dir.vpk`);
    vpkDir.load();

    return vpkDir;
}

function getRequiredVPKFiles(vpkDir) {
    const requiredIndices = [];

    for (const fileName of vpkDir.files) {
        for (const f of vpkFiles) {
            if (fileName.startsWith(f)) {
                console.log(`Found vpk for ${f}: ${fileName}`)

                const archiveIndex = vpkDir.tree[fileName].archiveIndex;

                if (!requiredIndices.includes(archiveIndex)) {
                    requiredIndices.push(archiveIndex);
                }

                break;
            }
        }
    }

    return requiredIndices.sort();
}

async function downloadVPKArchives(user, manifest, vpkDir) {
    const requiredIndices = getRequiredVPKFiles(vpkDir);

    console.log(`Required VPK files ${requiredIndices}`);

    for (let index in requiredIndices) {
        index = parseInt(index);

        // pad to 3 zeroes
        const archiveIndex = requiredIndices[index];
        const paddedIndex = '0'.repeat(3-archiveIndex.toString().length) + archiveIndex;
        const fileName = `pak01_${paddedIndex}.vpk`;

        const file = manifest.manifest.files.find((f) => f.filename.endsWith(fileName));
        const filePath = `${temp}/${fileName}`;

        const status = `[${index+1}/${requiredIndices.length}]`;

        console.log(`${status} Downloading ${fileName}`);

        await user.downloadFile(appId, depotId, file, filePath);
    }
}

function extractVPKFiles(vpkDir) {
    console.log("Extracting vpk files")

    for (const f of vpkFiles) {
        let found = false;
        for (const path of vpkDir.files) {
            if (path.startsWith(f)) {
                const file = vpkDir.getFile(path);
                const data = f.split('/');
                const fileName = data[data.length-1];

                try {
                    fs.writeFileSync(`${dir}/${fileName}`, file)
                } catch (err) {
                    throw err;
                }

                found = true;
                break;
            }
        }

        if (!found) {
            throw `could not find ${f}`;
        }
    }
}

if (process.argv.length != 4) {
    console.error(`Missing input arguments, expected 4 got ${process.argv.length}`);
    process.exit(1);
}

if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
}

if (!fs.existsSync(temp)){
    fs.mkdirSync(temp);
}

const user = new SteamUser();

console.log('Logging into Steam....');

user.logOn({
    accountName: process.argv[2],
    password: process.argv[3],
    rememberPassword: true,
    logonID: 2121,
});


user.once('loggedOn', async () => {
    const cs = (await user.getProductInfo([appId], [], true)).apps[appId].appinfo;
    const commonDepot = cs.depots[depotId];
    const latestManifestId = commonDepot.manifests.public.gid;

    console.log(`Obtained latest manifest ID: ${latestManifestId}`);

    let existingManifestId = "";

    try {
        existingManifestId = fs.readFileSync(`${dir}/${manifestIdFile}`);
    } catch (err) {
        if (err.code != 'ENOENT') {
            throw err;
        }
    }

    if (existingManifestId == latestManifestId) {
        console.log("Latest manifest Id matches existing manifest Id, exiting");
        process.exit(0);
    }

    console.log("Latest manifest Id does not match existing manifest Id, downloading game files")

    const manifest = await user.getManifest(appId, depotId, latestManifestId, 'public');

    const vpkDir = await downloadVPKDir(user, manifest);
    await downloadVPKArchives(user, manifest, vpkDir);
    extractVPKFiles(vpkDir);

    try {
        fs.writeFileSync(`${dir}/${manifestIdFile}`, latestManifestId);
    } catch (err) {
        throw err;
    }

    process.exit(0);
});
