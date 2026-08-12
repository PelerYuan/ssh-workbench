import Database from 'better-sqlite3';

const db = new Database('data/workbench.sqlite');
const sources = db.prepare('SELECT id, name, auth_type, LENGTH(credential) as cred_len, SUBSTR(credential, 1, 20) as cred_prefix FROM ssh_sources').all();
console.log(JSON.stringify(sources, null, 2));
db.close();
