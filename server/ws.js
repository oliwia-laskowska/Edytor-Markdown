import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { store } from './store.js';
const secret = process.env.JWT_SECRET || 'dev-secret';
const rooms = new Map();
function send(ws,msg){ if(ws.readyState===ws.OPEN) ws.send(JSON.stringify(msg)); }
function room(docId){ if(!rooms.has(docId)) rooms.set(docId,new Set()); return rooms.get(docId); }
function broadcast(docId,msg,except=null){ for(const ws of room(docId)){ if(ws!==except) send(ws,msg); } }
function presence(docId){ const users=[...room(docId)].map(ws=>ws.user).filter(Boolean); broadcast(docId,{type:'presence',users}); }
export function attachWebSocket(server){
    const wss=new WebSocketServer({server});
    wss.on('connection',(ws,req)=>{
        try{ const url=new URL(req.url,'http://localhost'); const token=url.searchParams.get('token'); const payload=jwt.verify(token,secret); const user=store.findUserById(payload.id); if(!user) throw new Error('auth'); ws.user=store.publicUser(user); }
        catch{ send(ws,{type:'error',message:'Brak autoryzacji WebSocket'}); ws.close(); return; }
        ws.on('message',raw=>{
            let msg; try{msg=JSON.parse(raw)}catch{return}
            if(msg.type==='join'){
                const doc=store.getDocument(msg.documentId); if(!doc||doc.owner_id!==ws.user.id){send(ws,{type:'error',message:'Brak dostępu do dokumentu'});return}
                if(ws.documentId) room(ws.documentId).delete(ws);
                ws.documentId=msg.documentId; room(ws.documentId).add(ws); presence(ws.documentId); return;
            }
            if(msg.type==='edit' && ws.documentId){
                const doc=store.getDocument(ws.documentId); if(!doc||doc.owner_id!==ws.user.id)return;
                store.updateDocument(ws.documentId,{content:String(msg.content||''),title:doc.title});
                broadcast(ws.documentId,{type:'edit',content:String(msg.content||''),user:ws.user},ws);
            }
        });
        ws.on('close',()=>{ if(ws.documentId){ room(ws.documentId).delete(ws); presence(ws.documentId); } });
    });
}
