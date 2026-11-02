/** 07-MAGIC: the fourth dart is a second creature, within 15 ft, at SL 3. */
export function arcaneMissilesTargets({count,distinct=true,distance=null}={}){
 return Number.isInteger(count)&&count>=1&&count<=2&&(count===1
  ||distinct&&(distance===null||Number.isFinite(distance)&&distance>=0&&distance<=15));
}
export function arcaneMissilesCount({success,sl,count}={}){
 return success&&Number(sl)>=3?Math.min(2,count):Math.min(1,count);
}
