import db from '../db.js';
export function audit(action){
  return (req,res,next)=>{
    res.on('finish', ()=>{
      if(['POST','PUT','DELETE'].includes(req.method)){
        const meta={ url:req.originalUrl, method:req.method, body:req.body };
        db.prepare('INSERT INTO audit_logs(actor_email,action,meta) VALUES (?,?,?)')
          .run(req.user?.email || 'anonymous', action, JSON.stringify(meta));
      }
    });
    next();
  }
}
