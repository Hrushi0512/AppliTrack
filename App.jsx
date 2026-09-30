import { useState, useEffect, useRef } from "react";
import {
  Briefcase, GraduationCap, Plus, Trash2, Edit3, FileText, Send, X,
  Upload, Check, Clock, XCircle, Download, Search, MapPin, Link2,
  Sparkles, BookOpen, PenTool, Star, ArrowRight, AlertTriangle,
  LogOut, Eye, EyeOff, Mic, ChevronRight, Lightbulb, Target,
  ExternalLink, LayoutDashboard, Menu, ArrowUpRight, Zap,
} from "lucide-react";

// ── CONFIG ───────────────────────────────────────
const SUPABASE_URL      = "https://jxfoiiqqwnqwncuhbvil.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4Zm9paXFxd25xd25jdWhidmlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjM3MzAsImV4cCI6MjA5Nzg5OTczMH0.8HNe5aIJk77RmcPChpW-PDEyr9sbMtPaPm0dMZLsVQ0";
const IS_CONFIGURED     = !SUPABASE_URL.startsWith("YOUR");

// ── GROQ AI — hardcoded key, FIXED model name ────
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_MODEL = "openai/gpt-oss-20b"; // ← was "openai/gpt-oss-20b" (invalid)

async function callGroq(messages, system = "", asJson = false) {
  const builtMessages = [
    ...(system ? [{ role:"system", content: system + (asJson ? "\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code fences." : "") }] : []),
    ...messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
  ];
  const body = { model: GROQ_MODEL, messages: builtMessages, max_tokens: 1024, temperature: 0.7 };
  if (asJson) body.response_format = { type: "json_object" };

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Groq API error (HTTP ${res.status})`);
  const text = data?.choices?.[0]?.message?.content || "";
  if (asJson) {
    try { return JSON.parse(text.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim()); }
    catch(e) { console.error("Groq JSON parse error:", e, text); return null; }
  }
  return text;
}

// ── SUPABASE ─────────────────────────────────────
const h = t => ({ "Content-Type":"application/json", "apikey":SUPABASE_ANON_KEY, ...(t?{"Authorization":`Bearer ${t}`}:{}) });

const SB = {
  signUp: async(e,p) => (await fetch(`${SUPABASE_URL}/auth/v1/signup`,{method:"POST",headers:h(),body:JSON.stringify({email:e,password:p})})).json(),
  signIn: async(e,p) => (await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:h(),body:JSON.stringify({email:e,password:p})})).json(),
  signOut: async(t) => fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:"POST",headers:h(t)}).catch(()=>{}),
  refreshToken: async(rt) => (await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:h(),body:JSON.stringify({refresh_token:rt})})).json(),
  getAllApps: async(t) => { const r=await fetch(`${SUPABASE_URL}/rest/v1/applications?select=created_at`,{headers:h(t)}); return r.ok?r.json():[]; },
  getApps: async(t,cat) => { const r=await fetch(`${SUPABASE_URL}/rest/v1/applications?category=eq.${cat}&order=created_at.desc&select=*`,{headers:h(t)}); return r.ok?r.json():[]; },
  addApp: async(t,app) => {
    const r=await fetch(`${SUPABASE_URL}/rest/v1/applications`,{method:"POST",headers:{...h(t),"Prefer":"return=representation"},body:JSON.stringify(app)});
    if(!r.ok){const b=await r.json().catch(()=>({}));throw new Error(b.message||b.hint||`Add failed (${r.status})`);}
    const d=await r.json(); return Array.isArray(d)?d[0]:d;
  },
  updateApp: async(t,id,data) => {
    const r=await fetch(`${SUPABASE_URL}/rest/v1/applications?id=eq.${id}`,{method:"PATCH",headers:{...h(t),"Prefer":"return=representation"},body:JSON.stringify(data)});
    if(!r.ok){const b=await r.json().catch(()=>({}));throw new Error(b.message||`Update failed (${r.status})`);}
    return r.json();
  },
  deleteApp: async(t,id) => fetch(`${SUPABASE_URL}/rest/v1/applications?id=eq.${id}`,{method:"DELETE",headers:h(t)}),
  uploadFile: async(t,uid,aid,file) => {
    const path=`${uid}/${aid}/${file.name}`;
    const r=await fetch(`${SUPABASE_URL}/storage/v1/object/resumes/${path}`,{
      method:"POST",headers:{"Authorization":`Bearer ${t}`,"apikey":SUPABASE_ANON_KEY,"Content-Type":file.type||"application/octet-stream","x-upsert":"true"},body:file,
    });
    if(!r.ok){const b=await r.json().catch(()=>null);throw new Error(b?.message||b?.error||`Upload failed (${r.status}). Check 'resumes' bucket + RLS.`);}
    return path;
  },
  getSignedUrl: async(t,path) => {
    const r=await fetch(`${SUPABASE_URL}/storage/v1/object/sign/resumes/${path}`,{method:"POST",headers:h(t),body:JSON.stringify({expiresIn:3600})});
    if(!r.ok){const b=await r.json().catch(()=>({}));throw new Error(b.message||"Could not generate signed URL");}
    const d=await r.json(); return d.signedURL?`${SUPABASE_URL}/storage/v1${d.signedURL}`:null;
  },
  deleteFile: async(t,path) => fetch(`${SUPABASE_URL}/storage/v1/object/resumes`,{method:"DELETE",headers:h(t),body:JSON.stringify({prefixes:[path]})}).catch(()=>{}),
};

const sessionCache = {
  save:  s  => { try{localStorage.setItem("at_s4",JSON.stringify(s));}catch{} },
  load:  () => { try{const r=localStorage.getItem("at_s4");return r?JSON.parse(r):null;}catch{return null;} },
  clear: () => { try{localStorage.removeItem("at_s4");}catch{} },
};

const tokenExpiresAt = t => { try{return JSON.parse(atob(t.split(".")[1])).exp*1000;}catch{return 0;} };

// ── CONSTANTS ─────────────────────────────────────
const CATS = {
  jobs:         { label:"Jobs",         icon:Briefcase,     entityLabel:"Company",    entityPh:"e.g. Google…",     roleLabel:"Position", rolePh:"e.g. Software Engineer…",    docLabel:"Resume" },
  universities: { label:"Universities", icon:GraduationCap, entityLabel:"University", entityPh:"e.g. MIT…",        roleLabel:"Program",  rolePh:"e.g. MSc Computer Science…", docLabel:"CV / SOP" },
};
const STATUS = {
  processing: { label:"Processing", color:"#F59E0B", bg:"rgba(245,158,11,0.12)",  Icon:Clock },
  accepted:   { label:"Accepted",   color:"#22C55E", bg:"rgba(34,197,94,0.12)",   Icon:Check },
  rejected:   { label:"Rejected",   color:"#EF4444", bg:"rgba(239,68,68,0.12)",   Icon:XCircle },
};
const IV_TYPES = [
  {id:"behavioral",label:"Behavioral",emoji:"🧠",desc:"Situational & STAR questions"},
  {id:"technical", label:"Technical", emoji:"💻",desc:"Role-specific technical depth"},
  {id:"mixed",     label:"Mixed",     emoji:"🎯",desc:"Combination of both"},
];

// ── HEATMAP UTILS ─────────────────────────────────
function buildGrid(allApps,weeks=20){
  const total=weeks*7,todayStr=new Date().toISOString().split("T")[0];
  const counts={};
  allApps.forEach(a=>{const d=new Date(a.created_at).toISOString().split("T")[0];counts[d]=(counts[d]||0)+1;});
  const start=new Date();start.setDate(start.getDate()-total+1);
  const flat=[];
  for(let i=0;i<total;i++){const d=new Date(start);d.setDate(d.getDate()+i);const ds=d.toISOString().split("T")[0];flat.push({date:ds,count:counts[ds]||0,isToday:ds===todayStr});}
  const cols=[];for(let w=0;w<weeks;w++)cols.push(flat.slice(w*7,(w+1)*7));return cols;
}
function calcStreak(allApps){
  const dates=new Set(allApps.map(a=>new Date(a.created_at).toISOString().split("T")[0]));
  const today=new Date().toISOString().split("T")[0];const yest=new Date(Date.now()-86400000).toISOString().split("T")[0];
  const appliedToday=dates.has(today);
  if(!appliedToday&&!dates.has(yest))return{streak:0,appliedToday:false};
  let streak=0,check=new Date(appliedToday?today:yest);
  while(true){const ds=check.toISOString().split("T")[0];if(dates.has(ds)){streak++;check.setDate(check.getDate()-1);}else break;}
  return{streak,appliedToday};
}
const cellClr=n=>n===0?"rgba(139,92,246,0.08)":n===1?"rgba(139,92,246,0.35)":n<=3?"rgba(139,92,246,0.65)":"#8B5CF6";

// ── DESIGN TOKENS ─────────────────────────────────
const C = {
  bg:"#0B0B0F",bgCard:"#141420",bgSidebar:"#0F0F18",bgElevated:"#1A1A28",bgInput:"rgba(255,255,255,0.05)",
  border:"rgba(255,255,255,0.07)",borderFocus:"rgba(139,92,246,0.5)",
  purple:"#7C3AED",purpleLight:"#A78BFA",purpleMed:"#8B5CF6",purpleDim:"rgba(124,58,237,0.15)",
  text:"#F1F5F9",textSub:"#94A3B8",textMuted:"#475569",
  green:"#22C55E",amber:"#F59E0B",red:"#EF4444",
};

const S = {
  input: { width:"100%",background:C.bgInput,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",transition:"border-color 0.15s" },
  label: { display:"block",color:C.textMuted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6 },
  iBtn:  { background:"transparent",border:"none",cursor:"pointer",padding:6,borderRadius:8,display:"flex",alignItems:"center",color:C.textSub,transition:"all 0.15s" },
  btn: (v="g") => ({
    display:"inline-flex",alignItems:"center",gap:7,padding:"9px 16px",borderRadius:10,fontSize:13,fontWeight:600,
    cursor:"pointer",border:"none",fontFamily:"inherit",transition:"all 0.18s",
    ...(v==="p"?{background:"linear-gradient(135deg,#7C3AED,#5B21B6)",color:"#fff",boxShadow:"0 4px 14px rgba(124,58,237,0.35)"}
      :v==="d"?{background:"#EF4444",color:"#fff"}
      :v==="v"?{background:C.purpleDim,color:C.purpleLight,border:`1px solid rgba(167,139,250,0.3)`}
      :v==="o"?{background:"rgba(245,158,11,0.12)",color:"#F59E0B",border:"1px solid rgba(245,158,11,0.3)"}
      :v==="g"?{background:"rgba(34,197,94,0.12)",color:"#22C55E",border:"1px solid rgba(34,197,94,0.3)"}
      :        {background:"rgba(255,255,255,0.06)",color:C.textSub,border:`1px solid ${C.border}`}),
  }),
};
const iFocus=e=>(e.target.style.borderColor=C.borderFocus);
const iBlur =e=>(e.target.style.borderColor=C.border);

// ══════════════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════════════
function Sidebar({cat,setCat,user,onLogout,onInterview,onAI,mobileOpen,onMobileClose}){
  const navItems=[
    {id:"dashboard",label:"Dashboard",icon:LayoutDashboard,isTab:false},
    {id:"jobs",     label:"Jobs",      icon:Briefcase,     isTab:true},
    {id:"universities",label:"Universities",icon:GraduationCap,isTab:true},
  ];
  const toolItems=[
    {label:"Mock Interview",icon:Mic,     action:onInterview},
    {label:"AI Assistant",  icon:Sparkles,action:onAI},
  ];

  const sidebarStyle={
    width:240,background:C.bgSidebar,borderRight:`1px solid ${C.border}`,
    height:"100vh",position:"sticky",top:0,display:"flex",flexDirection:"column",
    flexShrink:0,zIndex:60,
  };

  const navBtn=(active,onClick,children)=>(
    <button onClick={onClick} style={{
      width:"100%",display:"flex",alignItems:"center",gap:11,padding:"10px 12px",borderRadius:10,
      border:"none",cursor:"pointer",marginBottom:2,fontFamily:"inherit",textAlign:"left",
      background:active?"rgba(139,92,246,0.18)":"transparent",
      color:active?C.purpleLight:C.textMuted,transition:"all 0.15s",
    }}
    onMouseEnter={e=>{if(!active){e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.color=C.textSub;}}}
    onMouseLeave={e=>{if(!active){e.currentTarget.style.background="transparent";e.currentTarget.style.color=C.textMuted;}}}
    >{children}</button>
  );

  return(
    <>
      {/* mobile overlay */}
      {mobileOpen&&<div onClick={onMobileClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:59,backdropFilter:"blur(2px)"}}/>}

      <aside style={{
        ...sidebarStyle,
        ...(mobileOpen!==undefined?{
          position:"fixed",top:0,left:0,
          transform:mobileOpen?"translateX(0)":"translateX(-100%)",
          transition:"transform 0.28s cubic-bezier(.4,0,.2,1)",
        }:{}),
      }}>
        {/* Logo */}
        <div style={{padding:"22px 20px 18px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#7C3AED,#A78BFA)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <ArrowRight size={18} style={{color:"#fff"}}/>
            </div>
            <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:17,color:C.text,letterSpacing:"-0.02em"}}>AppliTrack</span>
          </div>
        </div>

        {/* Nav */}
        <div style={{flex:1,padding:"16px 10px",overflowY:"auto"}}>
          <p style={{color:C.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",padding:"0 10px",marginBottom:6}}>MENU</p>
          {navItems.map(item=>{
            const Icon=item.icon;
            const active=item.isTab?cat===item.id:true;
            return navBtn(active,()=>item.isTab&&setCat(item.id),
              <><Icon size={16}/><span style={{fontSize:13,fontWeight:active?600:400}}>{item.label}</span>
                {active&&item.isTab&&<div style={{width:6,height:6,borderRadius:"50%",background:C.purpleMed,marginLeft:"auto"}}/>}
              </>
            );
          })}

          <p style={{color:C.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",padding:"14px 10px 6px"}}>TOOLS</p>
          {toolItems.map(item=>{
            const Icon=item.icon;
            return(
              <button key={item.label} onClick={item.action} style={{
                width:"100%",display:"flex",alignItems:"center",gap:11,padding:"10px 12px",borderRadius:10,
                border:"none",cursor:"pointer",marginBottom:2,fontFamily:"inherit",
                background:"transparent",color:C.textMuted,transition:"all 0.15s",
              }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.color=C.textSub;}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=C.textMuted;}}>
                <Icon size={16}/><span style={{fontSize:13}}>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* User + Logout */}
        <div style={{padding:"12px 10px",borderTop:`1px solid ${C.border}`}}>
          <div style={{padding:"10px 12px",borderRadius:10,background:"rgba(255,255,255,0.03)",marginBottom:4}}>
            <p style={{color:C.textMuted,fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>Signed in as</p>
            <p style={{color:C.textSub,fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.email||"—"}</p>
          </div>
          <button onClick={onLogout} style={{
            width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,
            border:"none",cursor:"pointer",background:"transparent",color:C.textMuted,
            fontFamily:"inherit",fontSize:13,transition:"all 0.15s",
          }}
          onMouseEnter={e=>{e.currentTarget.style.color="#EF4444";e.currentTarget.style.background="rgba(239,68,68,0.08)";}}
          onMouseLeave={e=>{e.currentTarget.style.color=C.textMuted;e.currentTarget.style.background="transparent";}}>
            <LogOut size={15}/><span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

// ══════════════════════════════════════════════════
//  STAT CARD
// ══════════════════════════════════════════════════
function StatCard({label,value,color,accent}){
  return(
    <div style={{
      background: accent?"linear-gradient(135deg,#7C3AED 0%,#5B21B6 100%)":C.bgCard,
      border: accent?"none":`1px solid ${C.border}`,
      borderRadius:16,padding:"20px 22px",display:"flex",flexDirection:"column",gap:10,
      position:"relative",overflow:"hidden",
    }}>
      {accent&&<div style={{position:"absolute",top:-20,right:-20,width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,0.08)"}}/>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",position:"relative"}}>
        <p style={{color:accent?"rgba(255,255,255,0.7)":C.textMuted,fontSize:12,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</p>
        <div style={{width:30,height:30,borderRadius:"50%",background:accent?"rgba(255,255,255,0.2)":C.purpleDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <ArrowUpRight size={14} style={{color:accent?"#fff":C.purpleLight}}/>
        </div>
      </div>
      <p style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:38,color:accent?"#fff":color,lineHeight:1,position:"relative"}}>{value}</p>
    </div>
  );
}

// ══════════════════════════════════════════════════
//  SETUP SCREEN
// ══════════════════════════════════════════════════
const SQL=`CREATE TABLE applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL, entity TEXT NOT NULL, role TEXT NOT NULL,
  status TEXT DEFAULT 'processing', date DATE, location TEXT, link TEXT,
  notes TEXT, resume_name TEXT, resume_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON applications USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
-- After creating 'resumes' bucket in Storage:
CREATE POLICY "own_files" ON storage.objects FOR ALL
  USING (bucket_id='resumes' AND auth.uid()::text=(storage.foldername(name))[1])
  WITH CHECK (bucket_id='resumes' AND auth.uid()::text=(storage.foldername(name))[1]);`;

function SetupScreen(){
  const [copied,setCopied]=useState(false);
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800&family=Inter:wght@400;500;600&display=swap');*{box-sizing:border-box;margin:0;}pre{white-space:pre-wrap;word-break:break-all;}`}</style>
      <div style={{maxWidth:560,width:"100%"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}>
          <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#7C3AED,#A78BFA)",display:"flex",alignItems:"center",justifyContent:"center"}}><ArrowRight size={20} style={{color:"#fff"}}/></div>
          <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:22,color:C.text}}>AppliTrack · Setup</span>
        </div>
        <div style={{background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:12,padding:"14px 18px",marginBottom:24}}>
          <p style={{color:"#F59E0B",fontWeight:700,fontSize:14,marginBottom:4}}>⚙️ Supabase credentials not configured</p>
          <p style={{color:C.textSub,fontSize:13,lineHeight:1.6}}>Follow the steps at the top of App.jsx to connect your real database.</p>
        </div>
        <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <p style={{color:C.purpleLight,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>SQL Schema</p>
            <button onClick={()=>{navigator.clipboard?.writeText(SQL);setCopied(true);setTimeout(()=>setCopied(false),2000);}} style={{...S.btn(),padding:"4px 10px",fontSize:11}}>{copied?<><Check size={11}/>Copied!</>:"Copy"}</button>
          </div>
          <pre style={{color:C.textSub,fontSize:11,lineHeight:1.75}}>{SQL}</pre>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
//  AUTH SCREEN
// ══════════════════════════════════════════════════
function AuthScreen({onAuth}){
  const [tab,setTab]=useState("login");
  const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [conf,setConf]=useState("");
  const [show,setShow]=useState(false); const [busy,setBusy]=useState(false);
  const [err,setErr]=useState(""); const [info,setInfo]=useState("");
  const clear=()=>{setErr("");setInfo("");};
  const submit=async()=>{
    clear();
    if(!email.trim()||!pw)return setErr("Please fill in all fields.");
    if(tab==="register"&&pw!==conf)return setErr("Passwords do not match.");
    if(pw.length<6)return setErr("Password must be at least 6 characters.");
    setBusy(true);
    try{
      if(tab==="register"){
        const d=await SB.signUp(email,pw);
        if(d.error)return setErr(d.error.message||"Registration failed.");
        if(d.access_token)onAuth(d);
        else{setInfo("Account created! Confirm your email then sign in.");setTab("login");}
      }else{
        const d=await SB.signIn(email,pw);
        if(d.error)return setErr(d.error.message||"Login failed.");
        if(!d.access_token)return setErr("Login failed. Check credentials or confirm email.");
        onAuth(d);
      }
    }catch{setErr("Network error — check your Supabase URL.");}
    finally{setBusy(false);}
  };
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800&family=Inter:wght@400;500;600&display=swap');*{box-sizing:border-box;margin:0;}::placeholder{color:#334155;}input{outline:none;}`}</style>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:54,height:54,borderRadius:16,background:"linear-gradient(135deg,#7C3AED,#A78BFA)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",boxShadow:"0 8px 24px rgba(124,58,237,0.4)"}}><ArrowRight size={24} style={{color:"#fff"}}/></div>
          <h1 style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:28,color:C.text,marginBottom:6,letterSpacing:"-0.02em"}}>AppliTrack</h1>
          <p style={{color:C.textMuted,fontSize:14}}>Your personal application command centre</p>
        </div>
        <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:20,padding:30}}>
          <div style={{display:"flex",background:"rgba(255,255,255,0.04)",borderRadius:12,padding:4,marginBottom:24,gap:3}}>
            {["login","register"].map(t=>(
              <button key={t} onClick={()=>{setTab(t);clear();}} style={{flex:1,padding:"9px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",transition:"all 0.18s",background:tab===t?"linear-gradient(135deg,#7C3AED,#5B21B6)":"transparent",color:tab===t?"#fff":C.textMuted,boxShadow:tab===t?"0 2px 8px rgba(124,58,237,0.4)":"none"}}>
                {t==="login"?"Sign In":"Register"}
              </button>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div><label style={S.label}>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={S.input} onFocus={iFocus} onBlur={iBlur} onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
            <div><label style={S.label}>Password</label>
              <div style={{position:"relative"}}>
                <input type={show?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} placeholder="At least 6 characters" style={{...S.input,paddingRight:44}} onFocus={iFocus} onBlur={iBlur} onKeyDown={e=>e.key==="Enter"&&submit()}/>
                <button onClick={()=>setShow(!show)} style={{...S.iBtn,position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",padding:4}}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button>
              </div>
            </div>
            {tab==="register"&&<div><label style={S.label}>Confirm Password</label><input type={show?"text":"password"} value={conf} onChange={e=>setConf(e.target.value)} placeholder="Repeat password" style={S.input} onFocus={iFocus} onBlur={iBlur} onKeyDown={e=>e.key==="Enter"&&submit()}/></div>}
            {err&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:9,padding:"10px 14px",color:"#FCA5A5",fontSize:13,lineHeight:1.5}}>{err}</div>}
            {info&&<div style={{background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.25)",borderRadius:9,padding:"10px 14px",color:"#86EFAC",fontSize:13}}>{info}</div>}
            <button onClick={submit} disabled={busy} style={{...S.btn("p"),width:"100%",justifyContent:"center",padding:"13px",fontSize:14,fontWeight:800,marginTop:4,opacity:busy?0.7:1,borderRadius:11}}>
              {busy?"Please wait…":tab==="login"?"Sign In →":"Create Account →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── NOTIFICATION BANNER ───────────────────────────
function NotifBanner({streak,appliedToday,onDismiss}){
  if(appliedToday&&streak<2)return null;
  const [col,msg]=appliedToday?["#22C55E",`🔥 ${streak}-day streak! Keep it going.`]:streak>0?["#F59E0B",`⚡ Don't break your ${streak}-day streak! Apply somewhere today.`]:["#A78BFA","💡 Start your streak — add an application today!"];
  return(
    <div style={{background:`${col}10`,border:`1px solid ${col}28`,borderRadius:12,padding:"11px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:10}}>
      <Zap size={15} style={{color:col,flexShrink:0}}/>
      <p style={{color:col,fontSize:13,fontWeight:600,flex:1}}>{msg}</p>
      <button onClick={onDismiss} style={{...S.iBtn,padding:3,color:col}} onMouseEnter={e=>e.currentTarget.style.opacity="0.7"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}><X size={15}/></button>
    </div>
  );
}

// ── HEATMAP ───────────────────────────────────────
function Heatmap({allApps}){
  const{streak,appliedToday}=calcStreak(allApps);
  const cols=buildGrid(allApps,20);
  const[hov,setHov]=useState(null);
  const thisWeek=allApps.filter(a=>(new Date()-new Date(a.created_at))<7*86400000).length;
  return(
    <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:"18px 22px",marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:18}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:22}}>🔥</span>
            <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:26,color:C.text}}>{streak}</span>
            <span style={{color:C.textMuted,fontSize:13}}>day streak</span>
          </div>
          {appliedToday&&<span style={{background:"rgba(34,197,94,0.12)",border:"1px solid rgba(34,197,94,0.28)",color:"#22C55E",fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20}}>✓ Applied today</span>}
        </div>
        <div style={{display:"flex",gap:20}}>
          <div style={{textAlign:"right"}}><p style={{color:C.textMuted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>This week</p><p style={{color:C.text,fontWeight:700,fontSize:18,fontFamily:"'Space Grotesk',sans-serif"}}>{thisWeek}</p></div>
          <div style={{textAlign:"right"}}><p style={{color:C.textMuted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>All time</p><p style={{color:C.text,fontWeight:700,fontSize:18,fontFamily:"'Space Grotesk',sans-serif"}}>{allApps.length}</p></div>
        </div>
      </div>
      <div style={{overflowX:"auto"}}>
        <div style={{display:"flex",gap:3,minWidth:"fit-content"}}>
          {cols.map((week,wi)=>(
            <div key={wi} style={{display:"flex",flexDirection:"column",gap:3}}>
              {week.map((cell,di)=>(
                <div key={di} onMouseEnter={()=>setHov(cell)} onMouseLeave={()=>setHov(null)}
                  style={{width:12,height:12,borderRadius:3,background:cellClr(cell.count),cursor:"default",boxShadow:cell.isToday?"0 0 0 1.5px #8B5CF6":undefined,opacity:hov&&hov.date!==cell.date?0.55:1,transition:"opacity 0.1s"}}/>
              ))}
            </div>
          ))}
        </div>
        {hov&&hov.count>0&&<p style={{color:C.textMuted,fontSize:11,marginTop:8}}>{hov.count} application{hov.count!==1?"s":""} on {new Date(hov.date+"T12:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</p>}
        <div style={{display:"flex",alignItems:"center",gap:5,marginTop:8,justifyContent:"flex-end"}}>
          <span style={{color:C.textMuted,fontSize:10}}>Less</span>
          {[0,1,2,4].map(n=><div key={n} style={{width:10,height:10,borderRadius:2,background:cellClr(n)}}/>)}
          <span style={{color:C.textMuted,fontSize:10}}>More</span>
        </div>
      </div>
    </div>
  );
}

// ── BADGE ─────────────────────────────────────────
function Badge({status}){
  const s=STATUS[status]||STATUS.processing;
  return<span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 11px",borderRadius:20,fontSize:11,fontWeight:700,color:s.color,background:s.bg,border:`1px solid ${s.color}30`,letterSpacing:"0.02em"}}><s.Icon size={10}/>{s.label}</span>;
}

// ── SKILLS PANEL ──────────────────────────────────
function SkillsPanel({app}){
  const[skills,setSkills]=useState(null);const[busy,setBusy]=useState(false);const[errMsg,setErrMsg]=useState("");const[open,setOpen]=useState(false);
  const fetch_=async()=>{
    if(open){setOpen(false);return;}setOpen(true);if(skills)return;setBusy(true);setErrMsg("");
    try{
      const res=await callGroq([{role:"user",content:`Role: "${app.role}" at "${app.entity}". List exactly 6 key skills.\nReturn a JSON array only:\n[{"skill":"Python","level":"essential","reason":"why it matters for this exact role"},...]\nLevels: "essential"|"important"|"nice-to-have"`}],
        "You are a career coach. Return ONLY a valid JSON array, no markdown, no backticks, no extra text. Each item must have: skill (string), level (string), reason (string).",true);
      setSkills(Array.isArray(res)?res:[]);
    }catch(e){setErrMsg(e.message);setSkills([]);}
    setBusy(false);
  };
  const lvlC=l=>l==="essential"?"#22C55E":l==="important"?C.purpleLight:"#F59E0B";
  return(
    <div style={{marginTop:10}}>
      <button onClick={fetch_} style={{...S.btn(),padding:"4px 11px",fontSize:11,color:open?"#F59E0B":C.textMuted,border:`1px solid ${open?"rgba(245,158,11,0.3)":C.border}`,background:open?"rgba(245,158,11,0.08)":"transparent"}}>
        <Lightbulb size={11}/>{open?"Hide":"Suggest"} Skills
      </button>
      {open&&(
        <div style={{marginTop:10,padding:"14px 16px",background:"rgba(255,255,255,0.02)",border:`1px solid ${C.border}`,borderRadius:12}}>
          {busy?<p style={{color:C.textMuted,fontSize:12}}>Analysing role requirements…</p>
          :errMsg?<p style={{color:"#FCA5A5",fontSize:12,lineHeight:1.5}}>{errMsg}</p>
          :skills&&skills.length>0?(<>
            <p style={{...S.label,marginBottom:10}}>Key Skills for this Role</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {skills.map((s,i)=><div key={i} title={s.reason} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 11px",borderRadius:20,fontSize:11,fontWeight:600,background:`${lvlC(s.level)}15`,border:`1px solid ${lvlC(s.level)}30`,color:lvlC(s.level),cursor:"help"}}>{s.skill}</div>)}
            </div>
            <p style={{color:C.textMuted,fontSize:11,marginTop:8}}>🟢 Essential  🟣 Important  🟡 Nice to have · Hover for details</p>
          </>):<p style={{color:C.textMuted,fontSize:12}}>Could not load skills. Try again.</p>}
        </div>
      )}
    </div>
  );
}

// ── APPLICATION CARD ──────────────────────────────
function AppCard({app,cat,onEdit,onDelete,onResume,onAI,onInterview}){
  const[hov,setHov]=useState(false);
  const init=(app.entity||"?").slice(0,2).toUpperCase();
  const hues=["#818CF8","#34D399","#60A5FA","#F472B6","#FBBF24","#FB923C","#A78BFA"];
  const clr=hues[(app.entity?.charCodeAt(0)||0)%hues.length];
  return(
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{background:hov?C.bgElevated:C.bgCard,border:`1px solid ${hov?"rgba(139,92,246,0.2)":C.border}`,borderRadius:14,padding:"18px 20px",transition:"all 0.18s",cursor:"default"}}>
      <div style={{display:"flex",gap:14}}>
        <div style={{width:46,height:46,borderRadius:12,flexShrink:0,background:`${clr}1A`,border:`1px solid ${clr}40`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,color:clr,fontFamily:"'Space Grotesk',sans-serif"}}>{init}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
            <div>
              <p style={{color:C.text,fontWeight:700,fontSize:15,margin:0,fontFamily:"'Space Grotesk',sans-serif",letterSpacing:"-0.01em"}}>{app.entity}</p>
              <p style={{color:C.textSub,fontSize:13,margin:"3px 0 0"}}>{app.role}</p>
            </div>
            <Badge status={app.status}/>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"4px 16px",marginTop:9}}>
            {app.date&&<span style={{color:C.textMuted,fontSize:12,display:"flex",alignItems:"center",gap:4}}><Clock size={11}/>  {new Date(app.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>}
            {app.location&&<span style={{color:C.textMuted,fontSize:12,display:"flex",alignItems:"center",gap:4}}><MapPin size={11}/>{app.location}</span>}
            {app.link&&<a href={app.link} target="_blank" rel="noopener noreferrer" style={{color:C.purpleLight,fontSize:12,textDecoration:"none",display:"flex",alignItems:"center",gap:4}}><Link2 size={11}/>Link</a>}
          </div>
          {app.notes&&<p style={{color:C.textMuted,fontSize:12,marginTop:8,lineHeight:1.55}}>{app.notes.length>110?app.notes.slice(0,107)+"…":app.notes}</p>}

          <div style={{display:"flex",alignItems:"center",gap:7,marginTop:12,flexWrap:"wrap"}}>
            <button onClick={()=>onResume(app)} style={{...S.btn(),padding:"5px 12px",fontSize:11,color:app.resume_name?"#22C55E":C.textMuted,border:`1px solid ${app.resume_name?"rgba(34,197,94,0.3)":C.border}`,background:app.resume_name?"rgba(34,197,94,0.08)":"transparent"}}>
              {app.resume_name?<><FileText size={12}/>{app.resume_name.length>18?app.resume_name.slice(0,15)+"…":app.resume_name}</>:<><Upload size={12}/>Attach {cat.docLabel}</>}
            </button>
            <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
              <button onClick={()=>onInterview(app)} style={{...S.btn("o"),padding:"5px 11px",fontSize:11}}><Mic size={11}/>Interview</button>
              <button onClick={()=>onAI(app)} style={{...S.btn("v"),padding:"5px 11px",fontSize:11}}><Sparkles size={11}/>AI Help</button>
              <button onClick={()=>onEdit(app)} style={S.iBtn} onMouseEnter={e=>{e.currentTarget.style.color=C.purpleLight;e.currentTarget.style.background=C.purpleDim;}} onMouseLeave={e=>{e.currentTarget.style.color=C.textSub;e.currentTarget.style.background="transparent";}}><Edit3 size={15}/></button>
              <button onClick={()=>onDelete(app.id)} style={S.iBtn} onMouseEnter={e=>{e.currentTarget.style.color="#EF4444";e.currentTarget.style.background="rgba(239,68,68,0.1)";}} onMouseLeave={e=>{e.currentTarget.style.color=C.textSub;e.currentTarget.style.background="transparent";}}><Trash2 size={15}/></button>
            </div>
          </div>
          <SkillsPanel app={app}/>
        </div>
      </div>
    </div>
  );
}

// ── ADD / EDIT MODAL ──────────────────────────────
function AppModal({open,onClose,onSave,cat,data}){
  const blank={entity:"",role:"",status:"processing",date:new Date().toISOString().split("T")[0],location:"",link:"",notes:""};
  const[form,setForm]=useState(blank);const[file,setFile]=useState(null);const[saving,setSaving]=useState(false);const[errMsg,setErrMsg]=useState("");
  const fileRef=useRef();
  useEffect(()=>{setForm(data?{entity:data.entity||"",role:data.role||"",status:data.status||"processing",date:data.date||new Date().toISOString().split("T")[0],location:data.location||"",link:data.link||"",notes:data.notes||""}:blank);setFile(null);setErrMsg("");},[open,data?.id]);
  const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  const submit=async()=>{if(!form.entity.trim())return setErrMsg(`Enter a ${cat.entityLabel} name.`);setSaving(true);setErrMsg("");try{await onSave(form,file);}catch(e){setErrMsg(e.message||"Save failed.");}setSaving(false);};
  if(!open)return null;
  return(
    <div style={{position:"fixed",inset:0,zIndex:80,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(8px)"}} onClick={onClose}/>
      <div style={{position:"relative",zIndex:1,background:C.bgSidebar,border:`1px solid ${C.border}`,borderRadius:20,padding:28,width:"100%",maxWidth:500,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.6)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
          <h2 style={{color:C.text,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:20,letterSpacing:"-0.02em"}}>{data?"Edit":"Add"} Application</h2>
          <button style={S.iBtn} onClick={onClose}><X size={20}/></button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:15}}>
          {[["entity",cat.entityLabel,cat.entityPh],["role",cat.roleLabel,cat.rolePh],["location","Location (optional)","City, Country"],["link","Application URL (optional)","https://…"]].map(([k,l,p])=>(
            <div key={k}><label style={S.label}>{l}</label><input value={form[k]} onChange={set(k)} placeholder={p} style={S.input} onFocus={iFocus} onBlur={iBlur}/></div>
          ))}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div><label style={S.label}>Date Applied</label><input type="date" value={form.date} onChange={set("date")} style={S.input} onFocus={iFocus} onBlur={iBlur}/></div>
            <div><label style={S.label}>Status</label><select value={form.status} onChange={set("status")} style={{...S.input,cursor:"pointer"}}>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
          </div>
          <div><label style={S.label}>Notes (optional)</label><textarea value={form.notes} onChange={set("notes")} rows={3} placeholder="Referral, deadline, contacts…" style={{...S.input,resize:"vertical",lineHeight:1.55}} onFocus={iFocus} onBlur={iBlur}/></div>
          <div>
            <label style={S.label}>{cat.docLabel} (PDF/DOC/DOCX · max 10 MB)</label>
            <div onClick={()=>fileRef.current?.click()} style={{border:`1px dashed rgba(139,92,246,0.4)`,borderRadius:12,padding:18,textAlign:"center",cursor:"pointer",background:"rgba(139,92,246,0.04)",transition:"background 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(139,92,246,0.08)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(139,92,246,0.04)"}>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={e=>{if(e.target.files[0])setFile(e.target.files[0]);}}/>
              {file?<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,color:C.purpleLight}}><FileText size={18}/><span style={{fontSize:13,fontWeight:600}}>{file.name}</span><button onClick={e=>{e.stopPropagation();setFile(null);}} style={{...S.iBtn,color:"#EF4444",padding:2}}><X size={14}/></button></div>
              :data?.resume_name?<p style={{color:C.textSub,fontSize:13}}>Current: <span style={{color:C.purpleLight}}>{data.resume_name}</span> — click to replace</p>
              :<><Upload size={22} style={{color:C.textMuted,margin:"0 auto 8px",display:"block"}}/><p style={{color:C.textMuted,fontSize:13}}>Click to upload</p></>}
            </div>
          </div>
          {errMsg&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:9,padding:"10px 14px",color:"#FCA5A5",fontSize:13,lineHeight:1.5}}>{errMsg}</div>}
        </div>
        <div style={{display:"flex",gap:10,marginTop:24}}>
          <button onClick={onClose} style={{...S.btn(),flex:1,justifyContent:"center",padding:"12px"}}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{...S.btn("p"),flex:1,justifyContent:"center",padding:"12px",fontWeight:800,opacity:saving?0.7:1,borderRadius:11}}>{saving?"Saving…":data?"Save Changes":"Add Application"}</button>
        </div>
      </div>
    </div>
  );
}

// ── RESUME MODAL ──────────────────────────────────
function ResumeModal({app,token,onClose,onReplace,onDeleteResume}){
  const[url,setUrl]=useState(null);const[busy,setBusy]=useState(false);const[err,setErr]=useState("");
  const isPdf=app?.resume_name?.toLowerCase().endsWith(".pdf");
  useEffect(()=>{
    if(!app?.resume_path)return;let cancelled=false;
    setBusy(true);setUrl(null);setErr("");
    SB.getSignedUrl(token,app.resume_path).then(u=>{if(!cancelled){setUrl(u);setBusy(false);}}).catch(e=>{if(!cancelled){setErr(e.message||"Failed to load file");setBusy(false);}});
    return()=>{cancelled=true;};
  },[app?.resume_path,token]);
  if(!app)return null;
  return(
    <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.82)"}} onClick={onClose}/>
      <div style={{position:"relative",zIndex:1,background:C.bgSidebar,border:`1px solid ${C.border}`,borderRadius:20,width:"100%",maxWidth:860,maxHeight:"92vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 24px 64px rgba(0,0,0,0.6)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 22px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div><h3 style={{color:C.text,fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:16,margin:0}}>{app.resume_name}</h3><p style={{color:C.textMuted,fontSize:12,margin:"2px 0 0"}}>{app.entity} — {app.role}</p></div>
          <button style={S.iBtn} onClick={onClose}><X size={20}/></button>
        </div>
        <div style={{flex:1,overflow:"hidden",minHeight:360,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.3)"}}>
          {busy&&<p style={{color:C.textSub,fontSize:13}}>Generating secure preview link…</p>}
          {err&&<p style={{color:"#FCA5A5",fontSize:13,padding:"0 24px",textAlign:"center",lineHeight:1.6}}>{err}</p>}
          {url&&!busy&&isPdf&&<iframe src={`${url}#toolbar=1&navpanes=0`} style={{width:"100%",height:"100%",minHeight:400,border:"none"}} title="Document Preview"/>}
          {url&&!busy&&!isPdf&&(<div style={{textAlign:"center",padding:48}}><FileText size={52} style={{color:C.purpleLight,margin:"0 auto 14px",display:"block"}}/><p style={{color:C.text,fontWeight:600,fontSize:15,marginBottom:8}}>{app.resume_name}</p><p style={{color:C.textSub,fontSize:13,lineHeight:1.6}}>In-browser preview only available for PDF.<br/>Use buttons below to open or download.</p></div>)}
          {!busy&&!err&&!url&&(<div style={{textAlign:"center",padding:48}}><FileText size={42} style={{color:C.textMuted,margin:"0 auto 14px",display:"block"}}/><p style={{color:C.textSub,fontSize:13,marginBottom:16}}>No file attached.</p>{onReplace&&<button onClick={()=>{onClose();onReplace();}} style={{...S.btn("p")}}><Upload size={14}/>Attach a File</button>}</div>)}
        </div>
        {url&&!busy&&(
          <div style={{padding:"13px 18px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,flexWrap:"wrap",flexShrink:0,alignItems:"center"}}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none",flex:1,minWidth:120}}><button style={{...S.btn(),width:"100%",justifyContent:"center"}}><ExternalLink size={14}/>Open in New Tab</button></a>
            <a href={url} download={app.resume_name} style={{textDecoration:"none",flex:1,minWidth:120}}><button style={{...S.btn("p"),width:"100%",justifyContent:"center"}}><Download size={14}/>Download</button></a>
            {onReplace&&<button onClick={()=>{onClose();onReplace();}} style={{...S.btn(),flex:1,minWidth:100,justifyContent:"center"}}><Upload size={14}/>Replace</button>}
            {onDeleteResume&&<button onClick={onDeleteResume} title="Delete file" style={{...S.btn("d"),padding:"9px 14px",flexShrink:0,justifyContent:"center"}}><Trash2 size={15}/></button>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MOCK INTERVIEW ────────────────────────────────
function InterviewModal({open,onClose,initialApp}){
  const[phase,setPhase]=useState("setup");const[iType,setIType]=useState("behavioral");
  const[company,setCompany]=useState("");const[role,setRole]=useState("");const[answer,setAnswer]=useState("");
  const[qNum,setQNum]=useState(0);const[question,setQuestion]=useState("");const[tip,setTip]=useState("");
  const[feedback,setFeedback]=useState(null);const[scores,setScores]=useState([]);
  const[summary,setSummary]=useState(null);const[history,setHistory]=useState([]);const[aiErr,setAiErr]=useState("");
  useEffect(()=>{
    if(open&&initialApp){setCompany(initialApp.entity||"");setRole(initialApp.role||"");}
    if(!open){setPhase("setup");setQNum(0);setScores([]);setHistory([]);setFeedback(null);setSummary(null);setAnswer("");setAiErr("");}
  },[open,initialApp?.id]);
  const sysPrompt=`You are a professional ${iType} interviewer at "${company||"a top company"}" hiring for "${role||"this role"}". Conduct exactly 5 questions one at a time.\nReturn ONLY valid JSON.\nFor questions 1-4: {"feedback":"2-3 sentences","score":4,"nextQuestion":"...","tip":"short tip","done":false}\nAfter question 5: {"feedback":"...","score":3,"overallScore":3.8,"strengths":["...","..."],"improvements":["...","..."],"done":true}`;
  const startInterview=async()=>{
    setPhase("thinking");setAiErr("");
    try{
      const d=await callGroq([{role:"user",content:'Begin. Ask first question only. Return JSON: {"question":"...","tip":"..."}'}],sysPrompt,true);
      if(!d)throw new Error("No response from Groq.");
      setQuestion(d.question||"Tell me about yourself and why you are interested in this role.");setTip(d.tip||"");
      setHistory([{role:"user",content:"Begin."},{role:"assistant",content:JSON.stringify(d)}]);
      setQNum(1);setPhase("asking");
    }catch(e){setAiErr(e.message);setPhase("setup");}
  };
  const submitAnswer=async()=>{
    if(!answer.trim())return;setPhase("thinking");setAiErr("");
    const userMsg={role:"user",content:`My answer to Q${qNum}: ${answer}`};
    const newHist=[...history,userMsg];
    try{
      const d=await callGroq(newHist,sysPrompt,true);if(!d)throw new Error("No response from Groq.");
      const newScores=[...scores,d.score||3];setScores(newScores);
      setHistory([...newHist,{role:"assistant",content:JSON.stringify(d)}]);
      setFeedback({feedback:d.feedback,score:d.score||3});
      if(d.done){setSummary({...d,avg:newScores.reduce((a,b)=>a+b,0)/newScores.length});setPhase("done");}
      else{setQuestion(d.nextQuestion||"Tell me about a challenge you have overcome.");setTip(d.tip||"");setQNum(q=>q+1);setPhase("feedback");}
    }catch(e){setAiErr(e.message);setFeedback({feedback:"Could not get AI feedback. Please try again.",score:3});setPhase("feedback");}
    setAnswer("");
  };
  const stars=n=>[1,2,3,4,5].map(i=><Star key={i} size={14} fill={i<=n?"#F59E0B":"transparent"} style={{color:"#F59E0B"}}/>);
  if(!open)return null;
  return(
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(10px)"}}>
      <div style={{background:C.bgSidebar,border:`1px solid ${C.border}`,borderRadius:22,width:"100%",maxWidth:580,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 32px 80px rgba(0,0,0,0.7)"}}>
        <div style={{padding:"20px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:40,height:40,borderRadius:11,background:"linear-gradient(135deg,#F59E0B,#D97706)",display:"flex",alignItems:"center",justifyContent:"center"}}><Mic size={19} style={{color:"#fff"}}/></div>
          <div style={{flex:1}}>
            <h3 style={{color:C.text,fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:16}}>Mock Interview</h3>
            {phase!=="setup"&&<p style={{color:"#F59E0B",fontSize:12}}>{company||"Company"} · {role||"Role"} · {IV_TYPES.find(t=>t.id===iType)?.label} · Q{qNum}/5</p>}
          </div>
          {phase!=="thinking"&&<button style={S.iBtn} onClick={onClose}><X size={20}/></button>}
        </div>
        <div style={{padding:24}}>
          {aiErr&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:9,padding:"10px 14px",color:"#FCA5A5",fontSize:13,marginBottom:16,lineHeight:1.5}}>{aiErr}</div>}
          {phase==="setup"&&(
            <div style={{display:"flex",flexDirection:"column",gap:18}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                <div><label style={S.label}>Company / University</label><input value={company} onChange={e=>setCompany(e.target.value)} placeholder="e.g. Google" style={S.input} onFocus={iFocus} onBlur={iBlur}/></div>
                <div><label style={S.label}>Role / Program</label><input value={role} onChange={e=>setRole(e.target.value)} placeholder="e.g. Software Engineer" style={S.input} onFocus={iFocus} onBlur={iBlur}/></div>
              </div>
              <div><label style={{...S.label,marginBottom:10}}>Interview Type</label>
                <div style={{display:"flex",gap:10}}>
                  {IV_TYPES.map(t=>(
                    <button key={t.id} onClick={()=>setIType(t.id)} style={{flex:1,padding:"14px 8px",borderRadius:12,border:`2px solid ${iType===t.id?"#F59E0B":C.border}`,background:iType===t.id?"rgba(245,158,11,0.1)":C.bgCard,cursor:"pointer",textAlign:"center",transition:"all 0.2s"}}>
                      <div style={{fontSize:22,marginBottom:6}}>{t.emoji}</div>
                      <p style={{color:iType===t.id?"#F59E0B":C.text,fontWeight:700,fontSize:13,marginBottom:3}}>{t.label}</p>
                      <p style={{color:C.textMuted,fontSize:11}}>{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:14}}><p style={{color:C.textSub,fontSize:13,lineHeight:1.6}}>You'll get <strong style={{color:C.text}}>5 questions</strong> with individual feedback and scores, then an overall assessment.</p></div>
              <button onClick={startInterview} style={{...S.btn("o"),width:"100%",justifyContent:"center",padding:"13px",fontSize:15,fontWeight:800,borderRadius:12}}><Mic size={17}/>Start Interview</button>
            </div>
          )}
          {phase==="thinking"&&(<div style={{textAlign:"center",padding:"40px 20px"}}><div style={{width:50,height:50,borderRadius:14,background:"linear-gradient(135deg,#F59E0B,#D97706)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><Mic size={24} style={{color:"#fff"}}/></div><p style={{color:C.text,fontWeight:600,marginBottom:8}}>Thinking…</p><div style={{display:"flex",gap:6,justifyContent:"center"}}>{[0,0.2,0.4].map(d=><span key={d} style={{width:8,height:8,borderRadius:"50%",background:"#F59E0B",display:"block",animation:`dot 1.2s ${d}s infinite`}}/>)}</div></div>)}
          {phase==="asking"&&(<div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:14,padding:20}}>
              <span style={{color:"#F59E0B",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:10}}>Question {qNum} of 5</span>
              <p style={{color:C.text,fontSize:16,lineHeight:1.7,fontWeight:500}}>{question}</p>
              {tip&&<p style={{color:C.textMuted,fontSize:12,marginTop:10,background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"8px 12px"}}>💡 {tip}</p>}
            </div>
            <div><label style={S.label}>Your Answer</label><textarea value={answer} onChange={e=>setAnswer(e.target.value)} rows={5} placeholder="Type your answer here…" style={{...S.input,resize:"vertical",lineHeight:1.6}} onFocus={iFocus} onBlur={iBlur}/></div>
            <button onClick={submitAnswer} disabled={!answer.trim()} style={{...S.btn("o"),width:"100%",justifyContent:"center",padding:"12px",fontWeight:800,opacity:!answer.trim()?0.5:1,borderRadius:12}}>Submit Answer <ChevronRight size={16}/></button>
          </div>)}
          {phase==="feedback"&&feedback&&(<div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:14,padding:20}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{color:C.textMuted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>Feedback</span><div style={{display:"flex",gap:2,marginLeft:"auto"}}>{stars(feedback.score)}</div><span style={{color:"#F59E0B",fontWeight:700,fontSize:13}}>{feedback.score}/5</span></div>
              <p style={{color:C.textSub,fontSize:14,lineHeight:1.7}}>{feedback.feedback}</p>
            </div>
            <button onClick={()=>setPhase("asking")} style={{...S.btn("p"),width:"100%",justifyContent:"center",padding:"12px",fontWeight:800,borderRadius:12}}>Next Question <ChevronRight size={16}/></button>
          </div>)}
          {phase==="done"&&summary&&(<div style={{display:"flex",flexDirection:"column",gap:16}}>
            {feedback&&<div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}><p style={{color:C.textMuted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Final Question</p><div style={{display:"flex",gap:2,marginBottom:6}}>{stars(feedback.score)}</div><p style={{color:C.textSub,fontSize:13,lineHeight:1.6}}>{feedback.feedback}</p></div>}
            <div style={{background:"linear-gradient(135deg,rgba(245,158,11,0.12),rgba(217,119,6,0.08))",border:"1px solid rgba(245,158,11,0.25)",borderRadius:16,padding:20,textAlign:"center"}}>
              <p style={{color:C.textMuted,fontSize:12,marginBottom:6}}>Overall Score</p>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:48,color:"#F59E0B",lineHeight:1}}>{(summary.overallScore||summary.avg||0).toFixed(1)}<span style={{fontSize:24,color:C.textMuted}}>/5</span></div>
              <div style={{display:"flex",gap:4,justifyContent:"center",marginTop:8}}>{stars(Math.round(summary.overallScore||summary.avg||3))}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div style={{background:"rgba(34,197,94,0.07)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:12,padding:14}}><p style={{color:"#22C55E",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>✅ Strengths</p>{(summary.strengths||[]).map((s,i)=><p key={i} style={{color:C.textSub,fontSize:13,marginBottom:6,lineHeight:1.4}}>· {s}</p>)}</div>
              <div style={{background:C.purpleDim,border:`1px solid rgba(139,92,246,0.2)`,borderRadius:12,padding:14}}><p style={{color:C.purpleLight,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>🎯 Improve On</p>{(summary.improvements||[]).map((s,i)=><p key={i} style={{color:C.textSub,fontSize:13,marginBottom:6,lineHeight:1.4}}>· {s}</p>)}</div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setPhase("setup");setScores([]);setHistory([]);setFeedback(null);setSummary(null);setAnswer("");setQNum(0);setAiErr("");}} style={{...S.btn(),flex:1,justifyContent:"center",padding:"11px"}}>Try Again</button>
              <button onClick={onClose} style={{...S.btn("p"),flex:1,justifyContent:"center",padding:"11px",fontWeight:800,borderRadius:12}}>Done</button>
            </div>
          </div>)}
        </div>
      </div>
    </div>
  );
}

// ── AI ASSISTANT PANEL ────────────────────────────
function AIPanel({open,onClose,ctxApp,category}){
  const cat=CATS[category];
  const greeting=`👋 Hi! I'm your AI Career Assistant.\n\nI can help you tailor your ${cat.docLabel}, write cover letters, motivation letters, prep for interviews, or answer any question.\n\n${ctxApp?`I have context for **${ctxApp.entity}** — **${ctxApp.role}**. Use a quick action or ask anything!`:"Select a specific application's 'AI Help' button for context-aware advice."}`;
  const[msgs,setMsgs]=useState([{role:"assistant",content:greeting}]);
  const[input,setInput]=useState("");const[busy,setBusy]=useState(false);
  const endRef=useRef();
  useEffect(()=>{setMsgs([{role:"assistant",content:greeting}]);setInput("");},[ctxApp?.id,category]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  const sys=`You are an expert career and university application advisor. Help with resumes/CVs, cover letters, motivation letters, interview prep, and application strategy for ${category==="jobs"?"job":"university"} applications. Be warm, specific, concise (≤300 words unless drafting a full document). Use bullet points where helpful.`+(ctxApp?`\n\nCurrent application:\n- ${cat.entityLabel}: ${ctxApp.entity}\n- ${cat.roleLabel}: ${ctxApp.role}\n- Status: ${STATUS[ctxApp.status]?.label}${ctxApp.location?"\n- Location: "+ctxApp.location:""}${ctxApp.notes?"\n- Notes: "+ctxApp.notes:""}`:"")+"\n\nWhen tailoring a resume: highlight skills most relevant to the specific role. When writing cover/motivation letters: make them specific and authentic.";
  const ACTIONS=[
    {Icon:FileText,label:"Tailor Resume",  prompt:"Help me tailor my resume/CV for this application. What key skills and experiences should I highlight?"},
    {Icon:PenTool, label:"Cover Letter",   prompt:"Write a professional cover letter for this application."},
    {Icon:BookOpen,label:"Motivation Letter",prompt:"Help me write a strong, authentic motivation letter for this application."},
    {Icon:Target,  label:"Suggest Skills", prompt:"What are the top 8 skills I should develop for this role? Explain why each matters."},
  ];
  const send=async(text)=>{
    const msg=(text||input).trim();if(!msg||busy)return;setInput("");
    const updated=[...msgs,{role:"user",content:msg}];setMsgs(updated);setBusy(true);
    try{const apiMsgs=updated.filter((m,i)=>!(i===0&&m.role==="assistant"));const reply=await callGroq(apiMsgs,sys);setMsgs(m=>[...m,{role:"assistant",content:reply}]);}
    catch(e){setMsgs(m=>[...m,{role:"assistant",content:`❌ ${e.message}`}]);}
    setBusy(false);
  };
  if(!open)return null;
  return(
    <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.5)"}} onClick={onClose}/>
      <div style={{position:"relative",zIndex:1,width:"min(440px,100vw)",height:"100%",background:C.bgSidebar,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",boxShadow:"-20px 0 60px rgba(0,0,0,0.5)"}}>
        <div style={{padding:"18px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{width:40,height:40,borderRadius:11,background:"linear-gradient(135deg,#7C3AED,#A78BFA)",display:"flex",alignItems:"center",justifyContent:"center"}}><Sparkles size={19} style={{color:"#fff"}}/></div>
          <div style={{flex:1,minWidth:0}}>
            <h3 style={{color:C.text,fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:15}}>AI Career Assistant</h3>
            {ctxApp&&<p style={{color:C.purpleLight,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Context: {ctxApp.entity} — {ctxApp.role}</p>}
          </div>
          <button style={S.iBtn} onClick={onClose}><X size={18}/></button>
        </div>
        {ctxApp&&(
          <div style={{padding:"11px 16px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            <p style={{...S.label,marginBottom:9}}>Quick Actions</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {ACTIONS.map(a=><button key={a.label} onClick={()=>send(a.prompt)} style={{...S.btn("v"),padding:"5px 11px",fontSize:11}}><a.Icon size={11}/>{a.label}</button>)}
            </div>
          </div>
        )}
        <div style={{flex:1,overflowY:"auto",padding:16,display:"flex",flexDirection:"column",gap:11}}>
          {msgs.map((m,i)=>(
            <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",gap:8}}>
              {m.role==="assistant"&&<div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#7C3AED,#A78BFA)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:3}}><Sparkles size={13} style={{color:"#fff"}}/></div>}
              <div style={{maxWidth:"85%",padding:"11px 14px",fontSize:13,lineHeight:1.65,borderRadius:m.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px",background:m.role==="user"?"linear-gradient(135deg,#7C3AED,#5B21B6)":"rgba(255,255,255,0.05)",color:m.role==="user"?"#fff":C.textSub,fontWeight:m.role==="user"?600:400,border:m.role==="assistant"?`1px solid ${C.border}`:"none",whiteSpace:"pre-wrap"}}>
                {m.content.replace(/\*\*(.*?)\*\*/g,"$1")}
              </div>
            </div>
          ))}
          {busy&&<div style={{display:"flex",gap:8}}><div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#7C3AED,#A78BFA)",display:"flex",alignItems:"center",justifyContent:"center"}}><Sparkles size={13} style={{color:"#fff"}}/></div><div style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:"14px 14px 14px 4px",padding:"11px 14px",display:"flex",gap:5,alignItems:"center"}}>{[0,0.2,0.4].map(d=><span key={d} style={{width:6,height:6,borderRadius:"50%",background:C.purpleLight,display:"block",animation:`dot 1.2s ${d}s infinite`}}/>)}</div></div>}
          <div ref={endRef}/>
        </div>
        <div style={{padding:"13px 16px",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{display:"flex",gap:8}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask anything about your application…" style={{...S.input,flex:1,background:"rgba(255,255,255,0.04)"}}/>
            <button onClick={()=>send()} disabled={!input.trim()||busy} style={{...S.btn(input.trim()?"p":""),padding:"10px 15px",opacity:!input.trim()||busy?0.45:1,borderRadius:10}}><Send size={15}/></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════
export default function AppliTrack(){
  const[session,setSession]=useState(null);const[user,setUser]=useState(null);const[booting,setBooting]=useState(true);
  const[cat,setCat]=useState("jobs");
  const[apps,setApps]=useState([]);const[allApps,setAllApps]=useState([]);
  const[loading,setLoading]=useState(false);
  const[modal,setModal]=useState(false);const[editData,setEditData]=useState(null);
  const[aiOpen,setAiOpen]=useState(false);const[aiCtx,setAiCtx]=useState(null);
  const[ivOpen,setIvOpen]=useState(false);const[ivApp,setIvApp]=useState(null);
  const[resumeApp,setResumeApp]=useState(null);
  const[filter,setFilter]=useState("all");const[search,setSearch]=useState("");
  const[deleteId,setDeleteId]=useState(null);
  const[notifDismissed,setNotifDismissed]=useState(false);
  const[sidebarOpen,setSidebarOpen]=useState(false);

  const token=session?.access_token;const userId=user?.id;
  const category=CATS[cat];
  const{streak,appliedToday}=calcStreak(allApps);

  // Restore session
  useEffect(()=>{const s=sessionCache.load();if(s?.access_token){setSession(s);setUser(s.user);}setBooting(false);},[]);

  // JWT auto-refresh every 60 s
  useEffect(()=>{
    if(!session?.access_token)return;
    const tryRefresh=async()=>{
      const exp=tokenExpiresAt(session.access_token);
      if(Date.now()>exp-5*60*1000){
        try{const d=await SB.refreshToken(session.refresh_token);if(d?.access_token){const s={...d,user:session.user};sessionCache.save(s);setSession(s);}else{sessionCache.clear();setSession(null);setUser(null);}}catch{}
      }
    };
    tryRefresh();const id=setInterval(tryRefresh,60_000);return()=>clearInterval(id);
  },[session?.access_token]);

  // Load apps
  useEffect(()=>{
    if(!token)return;setLoading(true);
    Promise.all([SB.getApps(token,cat),SB.getAllApps(token)])
      .then(([ca,all])=>{setApps(Array.isArray(ca)?ca:[]);setAllApps(Array.isArray(all)?all:[]);})
      .catch(()=>{setApps([]);setAllApps([]);})
      .finally(()=>setLoading(false));
    setFilter("all");setSearch("");
  },[cat,token]);

  const refreshAll=async()=>{const[ca,all]=await Promise.all([SB.getApps(token,cat),SB.getAllApps(token)]);setApps(Array.isArray(ca)?ca:[]);setAllApps(Array.isArray(all)?all:[]);};

  const handleAuth=sess=>{const s={...sess,user:sess.user};sessionCache.save(s);setSession(s);setUser(s.user);};
  const handleLogout=async()=>{try{await SB.signOut(token);}catch{}sessionCache.clear();setSession(null);setUser(null);setApps([]);setAllApps([]);};

  const handleSave=async(form,file)=>{
    if(editData){
      let extra={};
      if(file){if(editData.resume_path)await SB.deleteFile(token,editData.resume_path).catch(()=>{});const p=await SB.uploadFile(token,userId,editData.id,file);extra={resume_name:file.name,resume_path:p};}
      await SB.updateApp(token,editData.id,{...form,...extra});
    }else{
      const inserted=await SB.addApp(token,{...form,category:cat,user_id:userId});
      if(!inserted?.id)throw new Error("Failed to create application.");
      if(file){try{const p=await SB.uploadFile(token,userId,inserted.id,file);await SB.updateApp(token,inserted.id,{resume_name:file.name,resume_path:p});}catch(e){await SB.deleteApp(token,inserted.id).catch(()=>{});throw new Error(`File upload failed: ${e.message}`);}  }
    }
    await refreshAll();setModal(false);setEditData(null);
  };
  const confirmDelete=async()=>{const app=apps.find(a=>a.id===deleteId);if(app?.resume_path)await SB.deleteFile(token,app.resume_path).catch(()=>{});await SB.deleteApp(token,deleteId);await refreshAll();setDeleteId(null);};
  const handleDeleteResume=async()=>{if(!resumeApp)return;try{await SB.deleteFile(token,resumeApp.resume_path);await SB.updateApp(token,resumeApp.id,{resume_name:null,resume_path:null});await refreshAll();setResumeApp(null);}catch(e){alert("Delete failed: "+e.message);}};

  const stats={total:apps.length,processing:apps.filter(a=>a.status==="processing").length,accepted:apps.filter(a=>a.status==="accepted").length,rejected:apps.filter(a=>a.status==="rejected").length};
  const visible=apps.filter(a=>(filter==="all"||a.status===filter)&&(!search||a.entity?.toLowerCase().includes(search.toLowerCase())||a.role?.toLowerCase().includes(search.toLowerCase())));
  const CatIcon=category.icon;

  if(!IS_CONFIGURED)return<SetupScreen/>;
  if(booting)return<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.textMuted,fontFamily:"Inter,sans-serif"}}>Loading…</div>;
  if(!session)return<AuthScreen onAuth={handleAuth}/>;

  return(
    <>
      {/* ── GLOBAL CSS: fixes Vite default narrow #root ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; background: ${C.bg}; }
        #root { max-width: none !important; width: 100% !important; padding: 0 !important; margin: 0 !important; }
        ::placeholder { color: #334155; }
        input, select, textarea { outline: none; }
        input:focus, select:focus, textarea:focus { border-color: ${C.borderFocus} !important; }
        select option { background: ${C.bgSidebar}; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        @keyframes dot { 0%,80%,100%{opacity:.3;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .entry { animation: fadeUp 0.22s ease; }
        /* responsive */
        @media (max-width: 768px) {
          .app-sidebar-desktop { display: none !important; }
          .stats-grid { grid-template-columns: repeat(2,1fr) !important; }
          .mobile-header { display: flex !important; }
          .app-main-pad { padding: 16px !important; }
        }
        @media (min-width: 769px) {
          .mobile-header { display: none !important; }
          .app-sidebar-mobile-overlay { display: none !important; }
        }
      `}</style>

      <div style={{display:"flex",width:"100%",minHeight:"100vh",background:C.bg,fontFamily:"'Inter',system-ui,sans-serif",color:C.text}}>

        {/* ── DESKTOP SIDEBAR ── */}
        <div className="app-sidebar-desktop">
          <Sidebar cat={cat} setCat={v=>{setCat(v);setSidebarOpen(false);}} user={user} onLogout={handleLogout}
            onInterview={()=>{setIvApp(null);setIvOpen(true);}} onAI={()=>{setAiCtx(null);setAiOpen(true);}}/>
        </div>

        {/* ── MOBILE SIDEBAR (overlay) ── */}
        <div className="app-sidebar-mobile-overlay">
          <Sidebar cat={cat} setCat={v=>{setCat(v);setSidebarOpen(false);}} user={user} onLogout={handleLogout}
            onInterview={()=>{setIvApp(null);setIvOpen(true);setSidebarOpen(false);}} onAI={()=>{setAiCtx(null);setAiOpen(true);setSidebarOpen(false);}}
            mobileOpen={sidebarOpen} onMobileClose={()=>setSidebarOpen(false)}/>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",minHeight:"100vh"}}>

          {/* Mobile top bar */}
          <header className="mobile-header" style={{display:"none",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",background:C.bgSidebar,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:50}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{...S.iBtn,padding:8}}><Menu size={20}/></button>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#7C3AED,#A78BFA)",display:"flex",alignItems:"center",justifyContent:"center"}}><ArrowRight size={14} style={{color:"#fff"}}/></div>
                <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:16,color:C.text}}>AppliTrack</span>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{setIvApp(null);setIvOpen(true);}} style={{...S.btn("o"),padding:"6px 10px",fontSize:11}}><Mic size={13}/>Interview</button>
              <button onClick={()=>{setAiCtx(null);setAiOpen(true);}} style={{...S.btn("v"),padding:"6px 10px",fontSize:11}}><Sparkles size={13}/>AI</button>
            </div>
          </header>

          {/* Dashboard content */}
          <main className="app-main-pad" style={{flex:1,padding:"28px 32px",overflowY:"auto"}}>

            {/* Page heading */}
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12}}>
              <div>
                <h1 style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:26,color:C.text,letterSpacing:"-0.02em",marginBottom:4}}>
                  {cat==="jobs"?"Job Applications":"University Applications"}
                </h1>
                <p style={{color:C.textMuted,fontSize:14}}>Track, manage and optimise your {cat==="jobs"?"career":"academic"} applications</p>
              </div>
              <button onClick={()=>{setEditData(null);setModal(true);}} style={{...S.btn("p"),padding:"11px 20px",fontSize:14,fontWeight:700,borderRadius:12,flexShrink:0}}>
                <Plus size={16}/>Add Application
              </button>
            </div>

            {/* Notification banner */}
            {!notifDismissed&&<NotifBanner streak={streak} appliedToday={appliedToday} onDismiss={()=>setNotifDismissed(true)}/>}

            {/* Stats grid */}
            <div className="stats-grid" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
              <StatCard label="Total Applications" value={stats.total}  color={C.purpleLight} accent={true}/>
              <StatCard label="Processing"          value={stats.processing} color={C.amber}/>
              <StatCard label="Accepted"            value={stats.accepted}   color={C.green}/>
              <StatCard label="Rejected"            value={stats.rejected}   color={C.red}/>
            </div>

            {/* Heatmap */}
            <Heatmap allApps={allApps}/>

            {/* Search + filters */}
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{position:"relative",flex:"1 1 200px",minWidth:0}}>
                <Search size={14} style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:C.textMuted,pointerEvents:"none"}}/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${cat==="jobs"?"companies":"universities"}…`} style={{...S.input,paddingLeft:38}}/>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {["all",...Object.keys(STATUS)].map(s=>{
                  const active=filter===s;const st=STATUS[s];
                  return<button key={s} onClick={()=>setFilter(s)} style={{...S.btn(),padding:"7px 14px",fontSize:12,
                    background:active?(s==="all"?C.purpleDim:st.bg):"transparent",
                    color:active?(s==="all"?C.purpleLight:st.color):C.textMuted,
                    border:active?`1px solid ${s==="all"?"rgba(139,92,246,0.4)":st.color+"50"}`:`1px solid ${C.border}`,
                    fontWeight:active?700:400,
                  }}>{s==="all"?"All":st.label}</button>;
                })}
              </div>
            </div>

            {/* Application list */}
            {loading?<div style={{textAlign:"center",padding:60,color:C.textMuted}}>Loading your applications…</div>
            :visible.length===0?(
              <div style={{textAlign:"center",padding:"60px 20px",background:C.bgCard,border:`1px dashed ${C.border}`,borderRadius:16}}>
                <CatIcon size={40} style={{color:C.textMuted,margin:"0 auto 16px",display:"block",opacity:0.5}}/>
                <p style={{color:C.textSub,fontWeight:600,fontSize:15,marginBottom:6}}>{apps.length===0?`No ${category.label} Applications Yet`:"No results match your filters"}</p>
                <p style={{color:C.textMuted,fontSize:13,marginBottom:apps.length===0?20:0}}>{apps.length===0?`Click "Add Application" to get started`:"Try clearing the search or filter."}</p>
                {apps.length===0&&<button onClick={()=>{setEditData(null);setModal(true);}} style={{...S.btn("p"),padding:"10px 22px",fontWeight:800,borderRadius:12,marginTop:4}}><Plus size={15}/>Add Application</button>}
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {visible.map(app=>(
                  <div key={app.id} className="entry">
                    <AppCard app={app} cat={category}
                      onEdit={a=>{setEditData(a);setModal(true);}}
                      onDelete={id=>setDeleteId(id)}
                      onResume={a=>{if(a.resume_name){setResumeApp(a);}else{setEditData(a);setModal(true);}}}
                      onAI={a=>{setAiCtx(a);setAiOpen(true);}}
                      onInterview={a=>{setIvApp(a);setIvOpen(true);}}/>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ── MODALS ── */}
      <AppModal open={modal} onClose={()=>{setModal(false);setEditData(null);}} onSave={handleSave} cat={category} data={editData}/>
      <AIPanel open={aiOpen} onClose={()=>setAiOpen(false)} ctxApp={aiCtx} category={cat}/>
      <InterviewModal open={ivOpen} onClose={()=>setIvOpen(false)} initialApp={ivApp}/>
      <ResumeModal app={resumeApp} token={token} onClose={()=>setResumeApp(null)} onReplace={()=>{setEditData(resumeApp);setModal(true);}} onDeleteResume={handleDeleteResume}/>

      {deleteId&&(
        <div style={{position:"fixed",inset:0,zIndex:250,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.75)"}} onClick={()=>setDeleteId(null)}/>
          <div style={{position:"relative",zIndex:1,background:C.bgSidebar,border:"1px solid rgba(239,68,68,0.3)",borderRadius:18,padding:28,maxWidth:360,width:"100%",boxShadow:"0 24px 64px rgba(0,0,0,0.6)"}}>
            <AlertTriangle size={28} style={{color:"#EF4444",marginBottom:14}}/>
            <h3 style={{color:C.text,fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,marginBottom:8,fontSize:18}}>Delete Application?</h3>
            <p style={{color:C.textMuted,fontSize:14,marginBottom:22,lineHeight:1.5}}>This permanently removes the application and any attached file from storage.</p>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setDeleteId(null)} style={{...S.btn(),flex:1,justifyContent:"center",padding:"11px"}}>Cancel</button>
              <button onClick={confirmDelete} style={{...S.btn("d"),flex:1,justifyContent:"center",padding:"11px",fontWeight:800,borderRadius:11}}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
