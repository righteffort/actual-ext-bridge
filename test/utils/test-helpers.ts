import { createServer, Server } from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface FakeServerSetup {
  server: Server;
  port: number;
  url: string;
}

export async function startFakeActualServer(): Promise<FakeServerSetup> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      // Serve the built fake site
      const distPath = join(process.cwd(), 'test/fake-actual-site/dist');
      
      if (req.url === '/' || req.url === '/index.html') {
        res.setHeader('Content-Type', 'text/html');
        try {
          const html = readFileSync(join(distPath, 'index.html'), 'utf-8');
          res.end(html);
        } catch (e) {
          res.statusCode = 500;
          res.end('Fake site not built. Run: cd test/fake-actual-site && npm run build');
        }
      } else if (req.url?.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
        try {
          const js = readFileSync(join(distPath, req.url), 'utf-8');
          res.end(js);
        } catch (e) {
          res.statusCode = 404;
          res.end('Not found');
        }
      } else if (req.url?.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
        try {
          const css = readFileSync(join(distPath, req.url), 'utf-8');
          res.end(css);
        } catch (e) {
          res.statusCode = 404;
          res.end('Not found');
        }
      } else {
        res.statusCode = 404;
        res.end('Not found');
      }
    });
    
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        const url = `http://localhost:${port}`;
        console.log(`Fake Actual site running at ${url}`);
        resolve({ server, port, url });
      }
    });
  });
}

export function stopFakeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
