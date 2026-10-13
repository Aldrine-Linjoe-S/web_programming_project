import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
const sessionCookie = 'campusfix_session';
const sessionDuration = 8 * 60 * 60;

async function loadLocalEnvironment() {
  try {
    const contents = (await fs.readFile(path.join(__dirname, '../.env'), 'utf8')).replace(/^\uFEFF/, '');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || match[1] in process.env) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

await loadLocalEnvironment();
const dbPath = process.env.CAMPUSFIX_DB_PATH ? path.resolve(process.env.CAMPUSFIX_DB_PATH) : path.join(__dirname, '../data/db.json');

function configuredAccount(username, password, role, displayName) {
  if (typeof username !== 'string' || typeof password !== 'string' || !username || password.length < 8) return null;
  const salt = randomBytes(16);
  return { username, role, displayName: displayName || username, salt, passwordHash: scryptSync(password, salt, 64) };
}

const sessionSecret = process.env.CAMPUSFIX_SESSION_SECRET;
const adminAccount = configuredAccount(process.env.CAMPUSFIX_ADMIN_USERNAME, process.env.CAMPUSFIX_ADMIN_PASSWORD, 'Admin', process.env.CAMPUSFIX_ADMIN_NAME || 'Campus Administrator');
let studentAccounts = [];
try {
  studentAccounts = JSON.parse(process.env.CAMPUSFIX_STUDENT_ACCOUNTS || '[]').map((student) => configuredAccount(student.username, student.password, 'Student', student.name));
} catch {
  throw new Error('CAMPUSFIX_STUDENT_ACCOUNTS must be a JSON array of student username, password, and name values.');
}
if (!sessionSecret || sessionSecret.length < 32) throw new Error('Set CAMPUSFIX_SESSION_SECRET to a random value of at least 32 characters in server/.env.');
if (!adminAccount) throw new Error('Set CAMPUSFIX_ADMIN_USERNAME and a CAMPUSFIX_ADMIN_PASSWORD of at least 8 characters in server/.env.');
if (studentAccounts.length === 0 || studentAccounts.some((account) => !account)) throw new Error('Configure at least one student with a username and password of at least 8 characters in CAMPUSFIX_STUDENT_ACCOUNTS.');
const accounts = [adminAccount, ...studentAccounts];
if (new Set(accounts.map((account) => account.username)).size !== accounts.length) throw new Error('Admin and student usernames must be unique.');

app.use(cors({ origin: process.env.CAMPUSFIX_CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());

function cookieOptions() {
  return `HttpOnly; SameSite=Strict; Path=/api; Max-Age=${sessionDuration}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', sessionSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function currentAccount(req) {
  const rawCookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookie}=`));
  if (!rawCookie) return null;
  try {
    const token = decodeURIComponent(rawCookie.slice(sessionCookie.length + 1));
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;
    const expected = createHmac('sha256', sessionSecret).update(encoded).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload.exp <= Date.now()) return null;
    return accounts.find((account) => account.username === payload.username && account.role === payload.role) || null;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  req.user = currentAccount(req);
  if (!req.user) return res.status(401).json({ message: 'Please sign in to continue.' });
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'Admin') return res.status(403).json({ message: 'Administrator access required.' });
  next();
}

function publicUser(account) {
  return { username: account.username, role: account.role, name: account.displayName };
}

function ownsComplaint(complaint, account) {
  return complaint.submittedById === account.username;
}

async function readDb() {
  return JSON.parse(await fs.readFile(dbPath, 'utf8'));
}

async function writeDb(data) {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
}

function normalizeComplaint(complaint) {
  return { ...complaint, createdAt: new Date(complaint.createdAt).toISOString(), updatedAt: new Date(complaint.updatedAt).toISOString() };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/login', (req, res) => {
  const { username, password, role } = req.body || {};
  const account = accounts.find((item) => item.username === username && item.role === role);
  if (!account || typeof password !== 'string') return res.status(401).json({ message: 'Username, password, or role is incorrect.' });
  const attempted = scryptSync(password, account.salt, account.passwordHash.length);
  if (!timingSafeEqual(attempted, account.passwordHash)) return res.status(401).json({ message: 'Username, password, or role is incorrect.' });
  const token = signSession({ username: account.username, role: account.role, exp: Date.now() + sessionDuration * 1000 });
  res.setHeader('Set-Cookie', `${sessionCookie}=${encodeURIComponent(token)}; ${cookieOptions()}`);
  res.json({ user: publicUser(account) });
});

app.get('/api/auth/session', (req, res) => {
  const account = currentAccount(req);
  res.json({ user: account ? publicUser(account) : null });
});

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.json({ ok: true });
});

app.get('/api/dashboard', requireAuth, async (req, res) => {
  const db = await readDb();
  const complaints = req.user.role === 'Admin' ? db.complaints : db.complaints.filter((complaint) => ownsComplaint(complaint, req.user));
  const counts = complaints.reduce((result, complaint) => {
    result.total += 1;
    if (complaint.status === 'Pending') result.pending += 1;
    if (complaint.status === 'In Progress') result.inProgress += 1;
    if (complaint.status === 'Resolved') result.resolved += 1;
    return result;
  }, { total: 0, pending: 0, inProgress: 0, resolved: 0 });
  res.json({ ...counts, recent: [...complaints].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5) });
});

app.get('/api/workers', requireAuth, requireAdmin, async (_req, res) => res.json((await readDb()).workers));

app.get('/api/complaints', requireAuth, async (req, res) => {
  const db = await readDb();
  const { search = '', status = 'All', category = 'All', submittedBy } = req.query;
  const query = search.toLowerCase();
  const visible = req.user.role === 'Admin' ? db.complaints : db.complaints.filter((complaint) => ownsComplaint(complaint, req.user));
  const complaints = visible.filter((complaint) => {
    const matchesSearch = !query || [complaint.id, complaint.title, complaint.building, complaint.roomNumber, complaint.category].some((value) => String(value).toLowerCase().includes(query));
    return matchesSearch && (status === 'All' || complaint.status === status) && (category === 'All' || complaint.category === category) && (req.user.role !== 'Admin' || !submittedBy || complaint.submittedBy === submittedBy);
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(complaints);
});

app.get('/api/reports', requireAuth, requireAdmin, async (_req, res) => res.json((await readDb()).complaints));

app.post('/api/complaints', requireAuth, upload.single('image'), async (req, res) => {
  const required = ['title', 'description', 'building', 'roomNumber', 'category', 'priority'];
  const missing = required.filter((field) => !req.body[field]?.trim());
  if (missing.length) return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
  const db = await readDb();
  const now = new Date().toISOString();
  const complaint = normalizeComplaint({ ...req.body, id: `CF-${1000 + db.complaints.length + 1}`, submittedBy: req.user.displayName, submittedById: req.user.username, status: 'Pending', assignedTo: null, resolutionNotes: '', image: req.file ? { name: req.file.originalname, size: req.file.size } : null, createdAt: now, updatedAt: now });
  db.complaints.push(complaint);
  await writeDb(db);
  res.status(201).json(complaint);
});

app.patch('/api/complaints/:id', requireAuth, requireAdmin, async (req, res) => {
  const db = await readDb();
  const complaint = db.complaints.find((item) => item.id === req.params.id);
  if (!complaint) return res.status(404).json({ message: 'Complaint not found.' });
  const allowed = ['status', 'assignedTo', 'resolutionNotes'];
  if (req.body.status !== undefined && !['Pending', 'In Progress', 'Resolved'].includes(req.body.status)) return res.status(400).json({ message: 'Status must be Pending, In Progress, or Resolved.' });
  for (const field of allowed) if (req.body[field] !== undefined) complaint[field] = req.body[field];
  complaint.updatedAt = new Date().toISOString();
  await writeDb(db);
  res.json(complaint);
});

app.use((error, _req, res, _next) => res.status(500).json({ message: error.message || 'Something went wrong.' }));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`CampusFix API running at http://localhost:${port}`));
