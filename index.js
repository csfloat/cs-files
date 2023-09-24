const SteamUser = require('steam-user');
const fs = require('fs');
const iconv = require('iconv-lite');
const appId = 730;
const depotId = 731;
const dir = `./static`;
const manifestIdFile = 'manifestId.txt'

function downloadFile(user, file) {
    const name = file.filename.split('\\');
    const fileName = name[name.length-1];
    
    console.log(`Downloading ${fileName}`)

    return user.downloadFile(appId, depotId, file, (err, data) => {
        if (data.type != "complete") {
            return
        }

        // Because Valve can't even return consistent files.
        // For whatever reason the csgo_english file is a UTF-16 file instead of the requested (and normally) UTF-8.
        if (fileName == "csgo_english.txt") {
            data.file = iconv.decode(data.file, 'UTF-16');
        }

        try {
            fs.writeFileSync(`${dir}/${fileName}`, data.file)
        } catch (err) {
            throw err;
        }
    });
}

if (process.argv.length != 4) {
    console.error(`Missing input arguments, expected 4 got ${process.argv.length}`);
    process.exit(1);
}

if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
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
    console.log('Obtaining latest manifest ID');

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

    const itemsGameFile = manifest.manifest.files.find((file) => file.filename.endsWith("items_game.txt"));
    await downloadFile(user, itemsGameFile);

    const csgoEnglishFile = manifest.manifest.files.find((file) => file.filename.endsWith("csgo_english.txt"));
    await downloadFile(user, csgoEnglishFile)

    const itemsGameCDNFile = manifest.manifest.files.find((file) => file.filename.endsWith("items_game_cdn.txt"));
    await downloadFile(user, itemsGameCDNFile)

    try {
        fs.writeFileSync(`${dir}/${manifestIdFile}`, latestManifestId)
    } catch (err) {
        throw err;
    }

    process.exit(0);
});
