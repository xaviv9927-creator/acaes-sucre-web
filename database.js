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
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    notificado_publico INTEGER DEFAULT 0
  )
`);

// Tabla de configuración
db.run(`
  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  )
`);

// Insertar WhatsApp por defecto si no existe
db.get("SELECT valor FROM configuracion WHERE clave = 'whatsapp'", (err, row) => {
  if (!row) {
    db.run("INSERT INTO configuracion (clave, valor) VALUES ('whatsapp', '584240000000')");
  }
});

module.exports = db;
