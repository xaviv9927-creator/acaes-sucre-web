const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'acaes.db');
const db = new sqlite3.Database(dbPath);

// Tabla de publicaciones
db.run(`
  CREATE TABLE IF NOT EXISTS publicaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    contenido TEXT,
    tipo TEXT DEFAULT 'texto',
    url_media TEXT,
    enlace_externo TEXT,
    userAdmin TEXT,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Tabla de configuración
db.run(`
  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  )
`);

// Tabla de usuarios registrados en la web
db.run(`
  CREATE TABLE IF NOT EXISTS usuarios_web (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT,
    ip TEXT,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Tabla de suscriptores de Telegram (los que hicieron /start)
db.run(`
  CREATE TABLE IF NOT EXISTS suscriptores_telegram (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL UNIQUE,
    username TEXT,
    nombre TEXT,
    fecha_suscripcion DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Insertar configuraciones por defecto
db.get("SELECT valor FROM configuracion WHERE clave = 'whatsapp'", (err, row) => {
  if (!row) db.run("INSERT INTO configuracion (clave, valor) VALUES ('whatsapp', '584240000000')");
});
db.get("SELECT valor FROM configuacione WHERE clave = 'admin_pass'", (err, row) => {
  if (!row) db.run("INSERT INTO configuracion (clave, valor) VALUES ('admin_pass', '12345678')");
});

module.exports = db;
