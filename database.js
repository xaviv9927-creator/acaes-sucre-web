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
    seccion_id INTEGER,
    url_media TEXT,
    enlace_externo TEXT,
    userAdmin TEXT,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Tabla de secciones
db.run(`
  CREATE TABLE IF NOT EXISTS secciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    orden INTEGER DEFAULT 0
  )
`);

// Tabla de configuración general
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
    ip TEXT,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Tabla de suscriptores de Telegram
db.run(`
  CREATE TABLE IF NOT EXISTS suscriptores_telegram (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL UNIQUE,
    username TEXT,
    nombre TEXT,
    fecha_suscripcion DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Insertar secciones por defecto
db.get("SELECT id FROM secciones WHERE nombre = 'Ciencia'", (err, row) => {
  if (!row) {
    db.run("INSERT INTO secciones (nombre, slug, orden) VALUES ('Ciencia', 'ciencia', 1)");
    db.run("INSERT INTO secciones (nombre, slug, orden) VALUES ('Investigación', 'investigacion', 2)");
    db.run("INSERT INTO secciones (nombre, slug, orden) VALUES ('Avistamiento', 'avistamiento', 3)");
  }
});

// Insertar configuraciones por defecto
const defaultConfigs = [
  ['whatsapp', '584240000000'],
  ['admin_pass', '12345678'],
  ['bot_token', '8669080229:AAEKBAK0w-bxVGJ_FFwKfcJpbayej3tIoqY'],
  ['admin_telegram_id', '7501019675']
];

defaultConfigs.forEach(([clave, valor]) => {
  db.get("SELECT valor FROM configuracion WHERE clave = ?", [clave], (err, row) => {
    if (!row) db.run("INSERT INTO configuracion (clave, valor) VALUES (?, ?)", [clave, valor]);
  });
});

module.exports = db;
