'use strict';
const CONFIG_URL = 'https://api.sconfig.io/package/configuration/',
  path = require('path'),
  fs = require('fs');
/**
 * Versions the microservice with the current timestamp.
 * We do this to allow graceful upgrades in production
 * Versioning arguments:
 *  --root={} - the root folder to use package.json ,defaults to process.cwd()
 *  --branch={branch} = (CI_COMMIT_REF_NAME)
 *  --commit={commit ref} - the commit ref (CI_COMMIT_SHA)
 *  --token={sconfig account key with root configuration data}
 *  --package-name="unloq-release" -- the configuration key to use
 *  --service={service name} - the microservice name, defaults to package.json name
 *  --version={semVer version} - the semver version to apply, defaults to package.json version
 */
module.exports = async (versionData) => {
  if (typeof versionData !== 'object' || !versionData) {
    versionData = module.exports.argv();
  }
  if (!versionData.branch || !versionData.token) {
    console.debug(`Skipping remote versioning`);
    return false;
  }
  if (versionData.branch.indexOf('release') !== 0) {
    console.debug(`Skip non-release branch`);
    return false;
  }
  if (!versionData.root) {
    versionData.root = process.cwd();
  }
  const fetch = require(path.normalize(versionData.root + '/node_modules/thorin/fetch'));
  try {
    let pkgData = JSON.parse(fs.readFileSync(path.normalize(versionData.root + "/package.json")), {encoding: 'utf8'});
    if (!versionData.version) {
      versionData.version = pkgData.version;
    }
    if (!versionData.service) {
      versionData.service = pkgData.name;
    }
  } catch (e) {
    console.error(`Could not read package.json file`);
    console.log(e);
    return process.exit(1);
  }
  if (!versionData.version) {
    console.error(`Version is not set`);
    throw new Error('Version data does not contain version');
  }
  if (!versionData.service) {
    console.error(`Service name is not set`);
    throw new Error('Version data does not contain service name');
  }
  if (!versionData.packageName) versionData.packageName = 'unloq-release';
  const packageName = versionData.packageName + '-' + versionData.version.split('.')[0];
  const versionUrl = CONFIG_URL + packageName;
  const requestData = {};
  const requestVersionData = {
    version: versionData.version
  };
  if (versionData.commit) {
    requestVersionData.commit = versionData.commit;
  }
  if (versionData.branch) {
    requestVersionData.branch = versionData.branch;
  }
  requestData[versionData.service] = requestVersionData;
  /* STEP ONE: update the UNLOQ latest version tags */
  console.log(`Saving remote configuration: ${packageName} (service: ${versionData.service}, version: ${versionData.version})`);
  try {
    await fetch(versionUrl, {
      method: 'POST',
      body: requestData,
      headers: {
        Authorization: versionData.token
      }
    });
    console.log(`Service ${versionData.service} tagged at version: ${versionData.version} in latest release pipeline`);
  } catch (e) {
    console.error(`Failed to save remote configuration`);
    console.log(e);
    throw e;
  }

  /* STEP TWO: update the version-specific build version with the commit ref */
  try {
    console.log(`Saving service ${versionData.service} commit ref ${versionData.commit} for version ${versionData.version}`);
    const commitUrl = CONFIG_URL + versionData.service,
      commitData = {},
      majorVersion = versionData.version.split('.')[0];
    commitData[majorVersion] = {};
    commitData[majorVersion][versionData.version] = versionData.commit;
    await fetch(commitUrl, {
      method: 'POST',
      body: JSON.parse(JSON.stringify(commitData)),
      headers: {
        'Content-Type': 'application/json',
        Authorization: versionData.token
      }
    });
    console.log(`Service ${versionData.service} tagged version: ${versionData.version} in microservice release pipeline`);
  } catch (e) {
    console.error(`Failed to save specific service configuration`);
    console.log(e);
    throw e;
  }
  return true;
};

/*
* Parse options from the argv
* */
module.exports.argv = () => {
  let versionData = {};
  for (let i = 0; i < process.argv.length; i++) {
    let item = process.argv[i];
    if (item.indexOf('--') !== 0) continue;
    let tmp = item.replace("--", "").split('='),
      key = tmp[0];
    if (key === 'package-name') key = 'packageName';
    versionData[tmp[0]] = tmp[1];
  }
  return versionData;
};

/**
 * Reads the configuration data of the given package name
 * Options:
 * --token={sconfig token}
 * --package-name={the package name to read.}
 * */
module.exports.read = async (data) => {
  if (typeof data !== 'object' || !data) {
    data = module.exports.argv();
  }
  if (!data.token) {
    throw thorin.error('DATA.TOKEN', 'Missing authentication token');
  }
  if (!data.packageName) {
    throw thorin.error('DATA.NAME', 'Missing package name');
  }
  if (!data.root) data.root = process.cwd();
  const fetch = require(path.normalize(data.root + '/node_modules/thorin/fetch'));
  const versionUrl = CONFIG_URL + data.packageName;
  return await fetch(versionUrl, {
    method: 'GET',
    headers: {
      Authorization: data.token
    }
  }).then((res) => res.json());
};