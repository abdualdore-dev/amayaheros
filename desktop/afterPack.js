// set the app icon and names on the Windows exe without wine
exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const fs = require('fs'), path = require('path');
  const exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.exe');
  const PE = await require('pe-library/cjs').load();
  const RE = await require('resedit/cjs').load();
  const pe = PE.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = PE.NtExecutableResource.from(pe);
  const ico = RE.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'build', 'icon.ico')));
  const groups = RE.Resource.IconGroupEntry.fromEntries(res.entries);
  const id = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
  RE.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map(i => i.data));
  const vi = RE.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    vi.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: 'Amaya Heroes', FileDescription: 'Amaya Heroes', CompanyName: 'Amaya', LegalCopyright: 'Amaya', OriginalFilename: 'Amaya Heroes.exe', InternalName: 'Amaya Heroes' });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
  console.log('  • icon and names written to', path.basename(exe));
};
