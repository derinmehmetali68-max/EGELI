import bwipjs from 'bwip-js'; import QRCode from 'qrcode';
export async function barcodeIsbn(req,res){
  const { isbn } = req.params;
  try{
    const png=await bwipjs.toBuffer({ bcid:'isbn', text:isbn, scale:3, height:10, includetext:true });
    res.setHeader('Content-Type','image/png'); res.end(png);
  }catch(e){
    const png=await bwipjs.toBuffer({ bcid:'code128', text:isbn, scale:3, height:10, includetext:true });
    res.setHeader('Content-Type','image/png'); res.end(png);
  }
}
export async function qrMember(req,res){
  const { id } = req.params;
  const png=await QRCode.toBuffer(`member:${id}`, { margin:1 });
  res.setHeader('Content-Type','image/png'); res.end(png);
}
