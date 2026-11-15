import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({download:vi.fn(),from:vi.fn()}));
vi.mock("@/components/crud-page",async(importOriginal)=>{const original=await importOriginal<Record<string,unknown>>();return {...original,db:{storage:{from:()=>({download:mocks.download})},from:mocks.from}};});
vi.mock("@/lib/session",()=>({arabicError:(e:Error)=>e.message}));
import { MaterialFileViewer } from "@/components/comm/material-file-viewer";
import { RecordForm } from "@/components/crud-page";
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const wrapper=({children}:{children:React.ReactNode})=><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{children}</QueryClientProvider>;
it("opens private plain text after access-checked fetch and downloads real blob",async()=>{
 const blob=new Blob(["Synthetic worksheet"],{type:"text/plain"}); Object.defineProperty(blob,"text",{value:async()=>"Synthetic worksheet"});mocks.download.mockResolvedValue({data:blob,error:null});
 const create=vi.fn(()=>"blob:synthetic");Object.defineProperty(URL,"createObjectURL",{configurable:true,value:create});Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:vi.fn()});
 const click=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>undefined);
 render(<MaterialFileViewer file={{id:"file",name:"worksheet.txt",mime_type:"text/plain",storage_path:"synthetic"}}/>,{wrapper});
 fireEvent.click(screen.getByRole("button",{name:"worksheet.txt"})); await screen.findByText("Synthetic worksheet");
 fireEvent.click(screen.getByRole("button",{name:"تنزيل"}));expect(mocks.download).toHaveBeenCalledWith("synthetic");expect(click).toHaveBeenCalledOnce();expect(create).toHaveBeenCalledWith(blob);
});
it("access denial exposes neither download nor file content",async()=>{
 mocks.download.mockResolvedValue({data:null,error:Error("Access denied")});render(<MaterialFileViewer file={{id:"denied",name:"private.txt",mime_type:"text/plain",storage_path:"foreign"}}/>,{wrapper});fireEvent.click(screen.getByRole("button",{name:"private.txt"}));await screen.findByText("Access denied");expect(screen.queryByRole("button",{name:"تنزيل"})).toBeNull();
});
it("editing section derives its stage and never persists transient selector",async()=>{
 const save=vi.fn();render(<RecordForm schoolId="school" initial={{grades:{stage_id:"stage"},grade_id:"grade",available:true}} fields={[{key:"_stage",label:"Stage",type:"select",transient:true,initialPath:["grades","stage_id"],options:[{value:"stage",label:"Stage"}]},{key:"grade_id",label:"Grade"},{key:"available",label:"Available",type:"checkbox"}]} submitting={false} onSubmit={save}/>,{wrapper});
 fireEvent.click(screen.getByRole("button",{name:"حفظ"}));await waitFor(()=>expect(save).toHaveBeenCalledWith({grade_id:"grade",available:true}));
});