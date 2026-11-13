const os = require('node:os');

// tsx needs only a stable cache-directory name from this call. The integration
// test subprocess avoids the Windows libuv user lookup that can fail with ENOMEM.
os.userInfo = () => ({
  username: 'tsx-test',
  uid: -1,
  gid: -1,
  homedir: process.env.TEMP || process.cwd(),
  shell: null,
});
