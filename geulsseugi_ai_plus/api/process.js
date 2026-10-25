import OpenAI from "openai";
const MAX_CHARS = 100_000;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
function chunksOf(text, size=10000){const out=[];for(let i=0;i<text.length;i+=size)out.push(text.slice(i,i+size));return out;}
async function ask(client,instructions,input){const r=await client.responses.create({model:MODEL,instructions,input});return r.output_text?.trim()||"";}
export default async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"POST 요청만 지원합니다."});}
 if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"서버에 OPENAI_API_KEY가 설정되지 않았어요. 배포 서비스의 환경 변수에 API 키를 추가해 주세요."});
 const {text,mode="summarize",style="쉽고 자연스럽게",length="보통",extra="",feedback=""}=req.body||{};
 if(typeof text!=="string"||!text.trim())return res.status(400).json({error:"먼저 글을 입력해 주세요."});
 if(text.length>MAX_CHARS)return res.status(413).json({error:"글은 최대 100,000자까지 입력할 수 있어요."});
 if(!["summarize","rewrite","write","evaluate","revise"].includes(mode))return res.status(400).json({error:"지원하지 않는 작업입니다."});
 if(mode==="revise"&&!String(feedback||extra).trim())return res.status(400).json({error:"반영할 피드백을 입력해 주세요."});
 const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
 try{
  let result="";
  if(mode==="summarize"){
   const parts=chunksOf(text,10000),summaries=[];
   for(let i=0;i<parts.length;i++)summaries.push(await ask(client,"너는 정확한 한국어 요약 전문가다. 원문에 없는 사실을 만들지 말고 핵심 주장, 중요한 정보, 인과관계를 보존해 이 부분의 요점을 정리하라.",`전체 글의 ${i+1}/${parts.length}번째 부분:\n${parts[i]}`));
   result=await ask(client,"부분 요약들을 통합하는 한국어 편집자다. 중복을 제거하되 중요한 내용은 보존하라. 원문에 없는 정보를 추가하지 말고 제목과 목록을 활용하라.",`원하는 길이: ${length}\n추가 요청: ${extra||"핵심 내용을 빠뜨리지 않고 요약해 줘."}\n\n부분 요약:\n${summaries.join("\n\n")}`);
  }else if(mode==="rewrite"){
   const parts=chunksOf(text,8000),edited=[];
   for(const part of parts)edited.push(await ask(client,`너는 한국어 글 편집자다. 원문의 의미와 사실을 유지하면서 문장 흐름과 맞춤법을 개선하라. 문체: ${style}. 요청: ${extra||"자연스럽고 명확하게 다듬어 줘."}. 새로운 사실을 만들지 마라.`,part));
   result=edited.join("\n\n");
  }else if(mode==="write"){
   const parts=chunksOf(text,10000),notes=[];
   for(let i=0;i<parts.length;i++)notes.push(await ask(client,"자료에서 글쓰기에 필요한 핵심 정보, 주장, 사례, 이름과 날짜를 정리하라. 자료에 없는 사실을 추측해 추가하지 마라.",`자료 ${i+1}/${parts.length}:\n${parts[i]}`));
   result=await ask(client,`너는 한국어 글쓰기 전문가다. 자료를 바탕으로 완성된 글을 작성하라. 문체: ${style}. 분량: ${length}. 제목과 문단을 사용하고 자료에 없는 사실은 만들지 마라. 추가 요청: ${extra||"핵심을 빠뜨리지 않고 자연스럽게 작성해 줘."}`,notes.join("\n\n"));
  }else if(mode==="evaluate"){
   const parts=chunksOf(text,9000),reviews=[];
   for(let i=0;i<parts.length;i++)reviews.push(await ask(client,"너는 친절하고 구체적인 한국어 글쓰기 코치다. 이 글 부분의 주제, 주장, 구성, 명확성, 근거와 예시, 문법과 표현을 살펴라. 잘한 점과 개선할 점을 구분하고, 수정 가능한 예시를 들어라. 전체 글의 일부만 보고 전체 점수를 확정하지 말고 부분에서 확인된 사항을 적어라.",`전체 글의 ${i+1}/${parts.length}번째 부분:\n${parts[i]}`));
   result=await ask(client,"너는 공정하고 건설적인 글쓰기 평가자다. 아래 분석을 종합해 한국어로 평가 보고서를 작성하라. 1) 총점 100점 및 기준별 점수(주제·구성·명확성·근거·문장 표현), 2) 점수의 이유, 3) 잘한 점, 4) 우선 고칠 점(중요도 순서), 5) 구체적인 수정 예시, 6) 다음 수정 때 확인할 체크리스트를 포함하라. 점수는 절대적인 진실이 아니라 참고용 평가임을 짧게 알리고, 글에 없는 사실을 단정하지 마라.",`글의 길이: ${text.length}자\n사용자 추가 요청/평가 기준: ${extra||"일반적인 글쓰기 기준으로 평가해 줘."}\n\n부분별 분석:\n${reviews.join("\n\n")}`);
  }else if(mode==="revise"){
   const parts=chunksOf(text,8500),edited=[];
   const instructions=`너는 한국어 글쓰기 코치이자 편집자다. 제공된 원문을 아래 피드백에 맞춰 다시 작성하라. 피드백을 가능한 한 구체적으로 반영하고, 원문의 핵심 의도와 사실은 유지하라. 확인할 수 없는 사실을 만들어내지 말고, 피드백끼리 충돌하면 사실성과 글의 목적을 우선하라. 문체: ${style}. 분량: ${length}. 추가 요청: ${extra||"피드백을 자연스럽게 반영해 줘."}\n반영할 피드백:\n${feedback||extra}\n결과에는 수정된 글만 출력하고, 해설이나 자기평가는 덧붙이지 마라.`;
   for(const part of parts)edited.push(await ask(client,instructions,part));
   result=edited.join("\n\n");
   // Final pass harmonizes voice and removes repeated transitions when the input spans chunks.
   if(parts.length>1)result=await ask(client,`다음은 긴 글을 부분별로 수정한 결과다. 전체 글의 흐름, 용어, 문체를 통일하고 중복되는 문장을 정리하라. 피드백 반영 내용과 사실은 보존하고 새로운 사실을 추가하지 마라. 수정된 글만 출력하라.\n피드백:\n${feedback}`,result);
  }
  return res.status(200).json({result,characters:text.length,model:MODEL});
 }catch(error){
  console.error("AI processing failed:",error?.message||error);
  const message=error?.status===429?"AI 사용량 제한에 도달했어요. 잠시 후 다시 시도하거나 API 사용량과 결제 설정을 확인해 주세요.":error?.status===401?"API 키 인증에 실패했어요. 서버의 OPENAI_API_KEY 설정을 확인해 주세요.":"AI 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
  return res.status(502).json({error:message});
 }
}
