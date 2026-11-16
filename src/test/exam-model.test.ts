import { describe, expect, it } from "vitest";
import { blankQuestion, scoreChoices, sheetIdentity } from "@/components/homework/exam-model";
describe("paper examination rules",()=>{
 it("scores correct options and gives no credit to empty or ambiguous answers",()=>{const q={...blankQuestion(),points:2,correct:[1]};expect(scoreChoices([q,q,q],[1,0,null])).toBe(2);});
 it("only matches the student number encoded for this examination and its target roster",()=>{const text=JSON.stringify({v:1,hw:"exam-a",student:"student-a"});expect(sheetIdentity(text,"exam-a",[{id:"student-a"}])).toBe("student-a");expect(sheetIdentity(text,"exam-b",[{id:"student-a"}])).toBeNull();expect(sheetIdentity(text,"exam-a",[{id:"student-b"}])).toBeNull();});
});