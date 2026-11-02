/** Area exemptions and damaging recipients are separate choices. Only offer
 * creatures visible to this user on the casting scene, excluding exemptions. */
export function areaSignatureRecipients({scene,exempt=[]}={}){
 if(!scene)return [];
 const spared=new Set(exempt.map(ref=>{
  const token=ref.sceneId&&ref.tokenId?game.scenes.get(ref.sceneId)?.tokens.get(ref.tokenId):null;
  return (token?.actor??game.actors.get(ref.actorId))?.uuid;
 }).filter(Boolean));
 return [...scene.tokens.values()].filter(token=>token.actor&&!spared.has(token.actor.uuid)
  &&(game.user?.isGM===true||token.object?.visible===true))
  .map(token=>({sceneId:scene.id,tokenId:token.id,actorId:token.actor.id,name:token.name}));
}
