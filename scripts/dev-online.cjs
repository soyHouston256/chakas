// Servidor local del build público con proxy a la API; no publica archivos del repositorio.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../dist/web');
const api = new URL(process.env.API_URL || 'http://127.0.0.1:3000');
const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.webmanifest':'application/manifest+json'};
http.createServer((req,res) => {
  if (req.url.startsWith('/api/')) {
    const proxy = http.request({hostname:api.hostname,port:api.port || 80,path:req.url,method:req.method,headers:{...req.headers,host:req.headers.host}}, reply => {
      res.writeHead(reply.statusCode,reply.headers); reply.pipe(res);
    });
    proxy.on('error',()=>{res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"API no disponible"}');});
    req.pipe(proxy); return;
  }
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
  let url;
  try {url = decodeURIComponent(new URL(req.url,'http://localhost').pathname);} catch {res.writeHead(400);res.end();return;}
  const file = path.resolve(root,'.'+(url === '/' ? '/index.html' : url));
  if (!file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
  fs.stat(file,(error,stat)=>{
    if(error || !stat.isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  });
}).listen(Number(process.env.WEB_PORT || 5174),'127.0.0.1',()=>console.log('Juego online local: http://127.0.0.1:'+(process.env.WEB_PORT || 5174)));
