const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'acaes_nueva.db');
const db = new sqlite3.Database(dbPath);

// Tabla de publicaciones (con categoria_id)
db.run(`
  CREATE TABLE IF NOT EXISTS publicaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    contenido TEXT,
    tipo TEXT DEFAULT 'texto',
    categoria_id INTEGER,
    url_media TEXT,
    enlace_externo TEXT,
    userAdmin TEXT,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Tabla de categorías (jerárquicas)
db.run(`
  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    padre_id INTEGER DEFAULT 0,
    orden INTEGER DEFAULT 0,
    FOREIGN KEY(padre_id) REFERENCES categorias(id) ON DELETE CASCADE
  )
`);

// Tabla de configuración
db.run(`
  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  )
`);

// Tabla de usuarios registrados
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

// Insertar categorías por defecto (estructura tipo Hubble/NASA)
const defaultCategorias = [
  { nombre: 'Inicio', slug: 'inicio', padre: 0, orden: 1 },
  { nombre: 'Noticias', slug: 'noticias', padre: 0, orden: 2 },
  { nombre: 'Imágenes', slug: 'imagenes', padre: 0, orden: 3 },
  { nombre: 'Mejores imágenes', slug: 'mejores-imagenes', padre: 3, orden: 1 },
  { nombre: 'Imagen del mes', slug: 'imagen-mes', padre: 3, orden: 2 },
  { nombre: 'Foto de la semana', slug: 'foto-semana', padre: 3, orden: 3 },
  { nombre: 'Vídeos', slug: 'videos', padre: 0, orden: 4 },
  { nombre: 'Boletines informativos', slug: 'boletines', padre: 0, orden: 5 },
  { nombre: 'Iniciativas', slug: 'iniciativas', padre: 0, orden: 6 },
  { nombre: 'Acerca de', slug: 'acerca', padre: 0, orden: 7 },
  { nombre: 'Prensa', slug: 'prensa', padre: 0, orden: 8 },
  { nombre: 'Contacto', slug: 'contacto', padre: 0, orden: 9 }
];

defaultCategorias.forEach(cat => {
  db.get("SELECT id FROM categorias WHERE slug = ?", [cat.slug], (err, row) => {
    if (!row && !err) {
      db.run("INSERT INTO categorias (nombre, slug, padre_id, orden) VALUES (?, ?, ?, ?)",
        [cat.nombre, cat.slug, cat.padre, cat.orden]);
    }
  });
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
    if (!row && !err) {
      db.run("INSERT INTO configuracion (clave, valor) VALUES (?, ?)", [clave, valor]);
    }
  });
});

console.log('✅ Base de datos actualizada con categorías jerárquicas');

module.exports = db;
