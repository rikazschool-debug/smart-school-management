import { describe, expect, it } from "vitest";
import { BUBBLE_SHEET, blankQuestion, bubblePoint, enhanceSheet, findSheetCorners, readBubbles, scoreChoices, sheetIdentity } from "@/components/homework/exam-model";
describe("paper examination rules",()=>{
 it("scores correct options and gives no credit to empty or ambiguous answers",()=>{const q={...blankQuestion(),points:2,correct:[1]};expect(scoreChoices([q,q,q],[1,0,null])).toBe(2);});
 it("only matches the student number encoded for this examination and its target roster",()=>{const text=JSON.stringify({v:1,hw:"exam-a",student:"student-a"});expect(sheetIdentity(text,"exam-a",[{id:"student-a"}])).toBe("student-a");expect(sheetIdentity(text,"exam-b",[{id:"student-a"}])).toBeNull();expect(sheetIdentity(text,"exam-a",[{id:"student-b"}])).toBeNull();});
 it("reads a photographed synthetic answer sheet and rejects missing alignment markers",()=>{
  const t=BUBBLE_SHEET; const data=new Uint8ClampedArray(t.width*t.height*4).fill(255);const image={width:t.width,height:t.height,data} as ImageData;
  const fill=(cx:number,cy:number,r:number)=>{for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){const n=(y*t.width+x)*4;data[n]=0;data[n+1]=0;data[n+2]=0;}};
  for(const x of [t.left,t.right])for(const y of [t.top,t.bottom])fill(x,y,15);
  fill(t.firstX+t.stepX,t.firstY,6);fill(t.firstX,t.firstY+t.stepY,6);fill(t.firstX+t.stepX,t.firstY+t.stepY,6);
  expect(readBubbles(image,findSheetCorners(image),[blankQuestion(),blankQuestion()])).toEqual([1,null]);
  const n=(t.top*t.width+t.left)*4;data.fill(255,n-4*16,n+4*16); // destroy marker center so it no longer qualifies as a solid square
  const empty={width:t.width,height:t.height,data:new Uint8ClampedArray(data.length).fill(255)} as ImageData;
  expect(()=>findSheetCorners(empty)).toThrow();
 });
});describe("photo clean-up before reading",()=>{
 it("a dim, washed-out photo is unreadable as-is but reads correctly after auto clarify",()=>{
  const t=BUBBLE_SHEET; const data=new Uint8ClampedArray(t.width*t.height*4).fill(185);const image={width:t.width,height:t.height,data} as ImageData;
  const fill=(cx:number,cy:number,r:number)=>{for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){const n=(y*t.width+x)*4;data[n]=data[n+1]=data[n+2]=120;}};
  for(const x of [t.left,t.right])for(const y of [t.top,t.bottom])fill(x,y,15);
  fill(t.firstX+t.stepX,t.firstY,6);
  expect(()=>findSheetCorners(image)).toThrow();
  enhanceSheet(image,{auto:true,brightness:0,contrast:20});
  expect(readBubbles(image,findSheetCorners(image),[blankQuestion()])).toEqual([1]);
 });
 it("places bubbles from the four markers",()=>{const t=BUBBLE_SHEET;const c=[{x:t.left,y:t.top},{x:t.right,y:t.top},{x:t.left,y:t.bottom},{x:t.right,y:t.bottom}];const p=bubblePoint(c,1,2);expect(p.x).toBeCloseTo(t.firstX+2*t.stepX);expect(p.y).toBeCloseTo(t.firstY+t.stepY);});
});
