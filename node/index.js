require('dotenv').config();

const express = require('express');
const { join } = require('path');
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync, rmSync } = require('fs');

const { generateKeys, unpack, pack } = require('./crypt.js');

const {
	NODE_PORT,
} = process.env;

const port = NODE_PORT || 3001;

let NODE_PRIVATE_KEY = existsSync(join(__dirname, 'rsa_key')) ? readFileSync(join(__dirname, 'rsa_key'), 'utf8') : null;
let NODE_PUBLIC_KEY = existsSync(join(__dirname, 'rsa_key.pub')) ? readFileSync(join(__dirname, 'rsa_key.pub'), 'utf8') : null;
let SERVER_PUBLIC_KEY = existsSync(join(__dirname, 'server_rsa_key.pub')) ? readFileSync(join(__dirname, 'server_rsa_key.pub'), 'utf8') : null;

if (!NODE_PRIVATE_KEY || !NODE_PUBLIC_KEY) {
	const keys = generateKeys();

	NODE_PRIVATE_KEY = keys.private;
	NODE_PUBLIC_KEY = keys.public;

	writeFileSync(join(__dirname, 'rsa_key'), NODE_PRIVATE_KEY);
	writeFileSync(join(__dirname, 'rsa_key.pub'), NODE_PUBLIC_KEY);
}

const app = express();

app
	.use(express.json({ limit: '1000mb' }))
	.use(express.urlencoded({ limit: '1000mb', extended: true }))
	.set('views', join(__dirname, 'views'))
	.set('view engine', 'ejs')
	.get('/', async (req, res) => {
		if (!SERVER_PUBLIC_KEY) {
			res.render('index', {
				publickey: NODE_PUBLIC_KEY,
			});
		} else {
			return res.send('Please use the panel!');
		}
	})
	.post('/init', (req, res) => {
		if (!req.body || !req.body.encrypted || !req.body.key) return res.json({ message: 'Missing the message!', success: false });

		const encryptedbody = req.body;
		const body = JSON.parse(unpack(encryptedbody));

		const newPublicServerKey = body.publickey;

		if (SERVER_PUBLIC_KEY && SERVER_PUBLIC_KEY !== newPublicServerKey) {
			const json = {
				message: 'Node is already connected to different panel!',
				success: false,
			};

			const encryptedjson = pack(newPublicServerKey, json);
			return res.json(encryptedjson);
		}

		SERVER_PUBLIC_KEY = newPublicServerKey;
		writeFileSync(join(__dirname, 'server_rsa_key.pub'), newPublicServerKey);

		const json = {
			message: 'Connected',
			success: true,
		};

		const encryptedjson = pack(newPublicServerKey, json);
		return res.json(encryptedjson);
	})
	.post('/files/view', (req, res) => {
		if (!req.body || !req.body.encrypted || !req.body.key) return res.json({ message: 'Missing the message!', success: false });
		if (!SERVER_PUBLIC_KEY) return res.json({ message: 'Please visit the panel and try again (node is not (yet) connected)!', success: false, reconnect: true });

		const encryptedbody = req.body;
		const body = JSON.parse(unpack(encryptedbody));

		if (!body.path) {
			const json = {
				message: 'Missing the path',
				success: false,
			};
			const encryptedjson = pack(SERVER_PUBLIC_KEY, json);

			return res.json(encryptedjson);
		}

		const dir = join(__dirname, 'files', body.path);

		const everything = readdirSync(dir);

		if (everything.length == 0) {
			const json = {
				message: 'This directory is empty',
				success: false,
			};
			const encryptedjson = pack(SERVER_PUBLIC_KEY, json);

			return res.json(encryptedjson);
		}

		const files = [];
		const directories = [];

		for (let i = 0; i < everything.length; i++) {
			const current = everything[i];

			if (statSync(`${dir}/${current}`).isDirectory()) directories.push(current);
			else files.push(current);

			if (i == everything.length - 1) {
				const json = {
					files,
					directories,
					success: true,
				};

				const encryptedjson = pack(SERVER_PUBLIC_KEY, json);
				return res.json(encryptedjson);
			}
		}
	})
	.post('/files/delete', async (req, res) => {
		if (!req.body || !req.body.encrypted || !req.body.key) return res.json({ message: 'Missing the message!', success: false });
		if (!SERVER_PUBLIC_KEY) return res.json({ message: 'Please visit the panel and try again (node is not (yet) connected)!', success: false, reconnect: true });

		const encryptedbody = req.body;
		const body = JSON.parse(unpack(encryptedbody));

		if (!body.file) return res.json({ message: 'No file selected!', success: false });

		const dir = join(__dirname, 'files', body.path || '.');

		if (!existsSync(`${dir}/${body.file}`)) return res.json({ message: 'File doesn\'t exists!', success: false });

		if(body.isDir) rmSync(`${dir}/${body.file}`, { recursive: true });
		else await unlinkSync(`${dir}/${body.file}`);

		const json = {
			message: 'File deleted!',
			success: true,
		};

		const encryptedjson = pack(SERVER_PUBLIC_KEY, json);
		return res.json(encryptedjson);
	})
	.post('/files/upload', async (req, res) => {
		if (!req.body || !req.body.encrypted || !req.body.key) return res.json({ message: 'Missing the message!', success: false });
		if (!SERVER_PUBLIC_KEY) return res.json({ message: 'Please visit the panel and try again (node is not (yet) connected)!', success: false, reconnect: true });

		const encryptedbody = req.body;
		const body = JSON.parse(unpack(encryptedbody));

		if (!body.file) return res.json({ message: 'No file selected!', success: false });

		const dir = join(__dirname, 'files', body.path || '.');
		const file = JSON.parse(body.file);

		if (existsSync(`${dir}/${file.name}`)) return res.json({ message: 'File already exists!', success: false });

		await writeFileSync(`${dir}/${file.name}`, Buffer.from(file.data.data), 'binary');

		const json = {
			message: 'File saved!',
			success: true,
		};

		const encryptedjson = pack(SERVER_PUBLIC_KEY, json);
		return res.json(encryptedjson);
	})
	.listen(port, (err) => {
		if (err) console.log(err);
		else console.log(`Server online on port ${port}`);
	});