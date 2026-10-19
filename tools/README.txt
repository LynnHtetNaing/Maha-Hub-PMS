HOW THE PMS PAGE IS PUBLISHED (private notes - this folder is never published)

 Readable source (edit this):     src/pms.source.html
 Published page (generated):      ecosystem/index.html   <- do not edit by hand

 After every change to the source run, from the repo root:
     node tools/build-pms.mjs
 and commit BOTH files. The tests check that they match.
 (first time only:  cd tools && npm install)

 .assetsignore lists what is NOT published (server code, database design, tests, docs, tools, source).
