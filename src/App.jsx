import { useState, useEffect, useRef } from "react";
import {
  Briefcase, GraduationCap, Plus, Trash2, Edit3, FileText, Send, X,
  Upload, Check, Clock, XCircle, Download, Search, MapPin, Link2,
  Sparkles, BookOpen, PenTool, Star, ArrowRight, AlertTriangle,
  LogOut, Eye, EyeOff, Mic, ChevronRight,Target
} from "lucide-react";

// ══════════════════════════════════════════════════
// ⚙️  CONFIG — paste your Supabase credentials
// supabase.com → project → Settings → API
// ══════════════════════════════════════════════════
const SUPABASE_URL = "https://jxfoiiqqwnqwncuhbvil.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NXDjILC1q2as3DBFaVepVQ_xusUCMnj";
const IS_CONFIGURED     = !SUPABASE_URL.startsWith("YOUR");

// ══════════════════════════════════════════════════
// SUPABASE  (pure fetch — no SDK)
// ══════════════════════════════════════════════════
const h = t => ({ "Content-Type":"application/json","apikey":SUPABASE_ANON_KEY,...(t?{"Authorization":`Bearer ${t}`}:{}) });

const SB = {
  async signUp(e,p)      { const r=await fetch(`${SUPABASE_URL}/auth/v1/signup`,{method:"POST",headers:h(),body:JSON.stringify({email:e,password:p})}); return r.json(); },
  async signIn(e,p)      { const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:h(),body:JSON.stringify({email:e,password:p})}); return r.json(); },
  async signOut(t)       { await fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:"POST",headers:h(t)}); },
  async getAllApps(t)     { const r=await fetch(`${SUPABASE_URL}/rest/v1/applications?select=created_at`,{headers:h(t)}); return r.ok?r.json():[]; },
  async getApps(t,cat)   { const r=await fetch(`${SUPABASE_URL}/rest/v1/applications?category=eq.${cat}&order=created_at.desc&select=*`,{headers:h(t)}); return r.ok?r.json():[]; },
  async addApp(t, app) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/applications`, {
      method: "POST",
      headers: { ...h(t), "Prefer": "return=representation" },
      body: JSON.stringify(app)
    });

    if (!r.ok) {
      const err = await r.json();
      console.log(err);
      throw new Error(JSON.stringify(err, null, 2));
    }

    const d = await r.json();
    return d[0];
  },
  async updateApp(t,id,d){ const r=await fetch(`${SUPABASE_URL}/rest/v1/applications?id=eq.${id}`,{method:"PATCH",headers:{...h(t),"Prefer":"return=representation"},body:JSON.stringify(d)}); if(!r.ok)throw new Error("Update failed"); return r.json(); },
  async deleteApp(t,id)  { await fetch(`${SUPABASE_URL}/rest/v1/applications?id=eq.${id}`,{method:"DELETE",headers:h(t)}); },
  async uploadFile(t, uid, aid, file) {
    const path = `${uid}/${aid}/${file.name}`;

    const r = await fetch(
      `${SUPABASE_URL}/storage/v1/object/resumes/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: file,
      }
    );

    if (!r.ok) {
      console.error(await r.text());
      throw new Error(await r.text());
    }

    return path;
  },
  async getSignedUrl(t,path) { const r=await fetch(`${SUPABASE_URL}/storage/v1/object/sign/resumes/${path}`,{method:"POST",headers:h(t),body:JSON.stringify({expiresIn:3600})}); const d=await r.json(); return d.signedURL?`${SUPABASE_URL}/storage/v1${d.signedURL}`:null; },
  async deleteFile(t,path)   { await fetch(`${SUPABASE_URL}/storage/v1/object/resumes`,{method:"DELETE",headers:h(t),body:JSON.stringify({prefixes:[path]})}); },
};

const sessionCache = {
  async save(s) {
    localStorage.setItem("at_s3", JSON.stringify(s));
  },

  async load() {
    const r = localStorage.getItem("at_s3");
    return r ? JSON.parse(r) : null;
  },

  async clear() {
    localStorage.removeItem("at_s3");
  }
};

// gemini.js

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY
});

export default ai;
// ══════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════
const CATS = {
  jobs:         { label:"Jobs",         icon:Briefcase,    entityLabel:"Company",    entityPh:"e.g. Google…",      roleLabel:"Position", rolePh:"e.g. Software Engineer…",    docLabel:"Resume" },
  universities: { label:"Universities", icon:GraduationCap,entityLabel:"University", entityPh:"e.g. MIT…",         roleLabel:"Program",  rolePh:"e.g. MSc Computer Science…", docLabel:"CV / SOP" },
};
const STATUS = {
  processing:{ label:"Processing",color:"#F5A623",bg:"rgba(245,166,35,0.12)", Icon:Clock },
  accepted:  { label:"Accepted",  color:"#2ECC71",bg:"rgba(46,204,113,0.12)",  Icon:Check },
  rejected:  { label:"Rejected",  color:"#FF6B6B",bg:"rgba(255,107,107,0.12)",Icon:XCircle },
};
const IV_TYPES = [
  {id:"behavioral",label:"Behavioral",emoji:"🧠",desc:"Situational & STAR questions"},
  {id:"technical", label:"Technical", emoji:"💻",desc:"Role-specific technical depth"},
  {id:"mixed",     label:"Mixed",     emoji:"🎯",desc:"Combination of both"},
];

// ══════════════════════════════════════════════════
// HEATMAP UTILS
// ══════════════════════════════════════════════════
function buildGrid(allApps, weeks=20) {
  const total=weeks*7, todayStr=new Date().toISOString().split("T")[0];
  const counts={};
  allApps.forEach(a=>{ const d=new Date(a.created_at).toISOString().split("T")[0]; counts[d]=(counts[d]||0)+1; });
  const start=new Date(); start.setDate(start.getDate()-total+1);
  const flat=[];
  for(let i=0;i<total;i++){
    const d=new Date(start); d.setDate(d.getDate()+i);
    const ds=d.toISOString().split("T")[0];
    flat.push({date:ds,count:counts[ds]||0,isToday:ds===todayStr,month:d.getMonth(),day:d.getDay()});
  }
  const cols=[];
  for(let w=0;w<weeks;w++) cols.push(flat.slice(w*7,(w+1)*7));
  return cols;
}

function calcStreak(allApps) {
  const dates=new Set(allApps.map(a=>new Date(a.created_at).toISOString().split("T")[0]));
  const today=new Date().toISOString().split("T")[0];
  const yest=new Date(Date.now()-86400000).toISOString().split("T")[0];
  const appliedToday=dates.has(today);
  if(!appliedToday&&!dates.has(yest)) return {streak:0,appliedToday:false};
  let streak=0, check=new Date(appliedToday?today:yest);
  while(true){ const ds=check.toISOString().split("T")[0]; if(dates.has(ds)){streak++;check.setDate(check.getDate()-1);}else break; }
  return {streak,appliedToday};
}

const cellClr = n => n===0?"rgba(255,255,255,0.06)":n===1?"rgba(74,222,128,0.28)":n<=3?"rgba(74,222,128,0.55)":"#4ADE80";

// ══════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════
const S = {
  card:   {background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:"16px 18px"},
  input:  {width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.11)",borderRadius:9,padding:"10px 13px",color:"#EEF2FF",fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit"},
  label:  {display:"block",color:"#9AA3B2",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6},
  iBtn:   {background:"transparent",border:"none",cursor:"pointer",padding:5,borderRadius:7,display:"flex",alignItems:"center",color:"#9AA3B2",transition:"color 0.15s"},
  btn:(v="g")=>({display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer",border:"none",fontFamily:"inherit",transition:"all 0.15s",
    ...(v==="p"?{background:"#4ADE80",color:"#0A1628"}:v==="d"?{background:"#FF6B6B",color:"#fff"}:v==="v"?{background:"rgba(167,139,250,0.15)",color:"#A78BFA",border:"1px solid rgba(167,139,250,0.3)"}:v==="o"?{background:"rgba(251,146,60,0.15)",color:"#FB923C",border:"1px solid rgba(251,146,60,0.3)"}:{background:"rgba(255,255,255,0.06)",color:"#9AA3B2",border:"1px solid rgba(255,255,255,0.1)"})}),
};
const iFocus=e=>(e.target.style.borderColor="rgba(74,222,128,0.45)");
const iBlur =e=>(e.target.style.borderColor="rgba(255,255,255,0.11)");

// ══════════════════════════════════════════════════
// SETUP SCREEN
// ══════════════════════════════════════════════════
const SQL=`CREATE TABLE applications (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category    TEXT NOT NULL,
  entity      TEXT NOT NULL,
  role        TEXT NOT NULL,
  status      TEXT DEFAULT 'processing',
  date        DATE,
  location    TEXT,
  link        TEXT,
  notes       TEXT,
  resume_name TEXT,
  resume_path TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON applications USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- After creating 'resumes' bucket in Storage UI:
CREATE POLICY "own_files" ON storage.objects FOR ALL
  USING (bucket_id='resumes' AND auth.uid()::text=(storage.foldername(name))[1])
  WITH CHECK (bucket_id='resumes' AND auth.uid()::text=(storage.foldername(name))[1]);`;

function SetupScreen() {
  const [copied,setCopied]=useState(false);
  const steps=[
    {n:"1",t:"Create a free Supabase project",   b:"supabase.com → New Project (free tier works fine)"},
    {n:"2",t:"Run the SQL schema",                b:"Dashboard → SQL Editor → New query → paste SQL below → Run"},
    {n:"3",t:'Create a "resumes" storage bucket', b:"Dashboard → Storage → New bucket → name: resumes → Private"},
    {n:"4",t:"Disable email confirmation",        b:"Auth → Settings → uncheck 'Enable email confirmations' for easy testing"},
    {n:"5",t:"Copy credentials",                  b:"Settings → API → Project URL + anon public key"},
    {n:"6",t:"Paste into this file",              b:"Replace YOUR_SUPABASE_URL and YOUR_SUPABASE_ANON_KEY at the top, re-run"},
  ];
  return (
    <div style={{minHeight:"100vh",background:"#060E1A",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800&family=Inter:wght@400;500;600&display=swap');*{box-sizing:border-box;margin:0;}pre{white-space:pre-wrap;word-break:break-all;}`}</style>
      <div style={{maxWidth:"100%",width:"100%"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}>
          <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#4ADE80,#22D3EE)",display:"flex",alignItems:"center",justifyContent:"center"}}><ArrowRight size={20} style={{color:"#0A1628"}}/></div>
          <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:22,color:"#EEF2FF"}}>AppliTrack · Setup</span>
        </div>
        <div style={{background:"rgba(245,166,35,0.08)",border:"1px solid rgba(245,166,35,0.3)",borderRadius:12,padding:"14px 18px",marginBottom:24}}>
          <p style={{color:"#F5A623",fontWeight:700,fontSize:14,marginBottom:4}}>⚙️ Supabase credentials not configured</p>
          <p style={{color:"#9AA3B2",fontSize:13,lineHeight:1.6}}>Follow these steps to connect your real database — takes ~5 minutes, free.</p>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:24}}>
          {steps.map(({n,t,b})=>(
            <div key={n} style={{display:"flex",gap:14}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(74,222,128,0.12)",border:"1px solid rgba(74,222,128,0.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#4ADE80",fontSize:12,fontWeight:800}}>{n}</div>
              <div><p style={{color:"#EEF2FF",fontWeight:600,fontSize:14,marginBottom:3}}>{t}</p><p style={{color:"#6B7280",fontSize:13,lineHeight:1.5}}>{b}</p></div>
            </div>
          ))}
        </div>
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <p style={{color:"#4ADE80",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>SQL Schema</p>
            <button onClick={()=>{navigator.clipboard?.writeText(SQL);setCopied(true);setTimeout(()=>setCopied(false),2000);}} style={{...S.btn(),padding:"4px 10px",fontSize:11}}>{copied?<><Check size={11}/>Copied!</>:"Copy"}</button>
          </div>
          <pre style={{color:"#9AA3B2",fontSize:11,lineHeight:1.75}}>{SQL}</pre>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// AUTH SCREEN
// ══════════════════════════════════════════════════
function AuthScreen({onAuth}) {
  const [tab,setTab]=useState("login");
  const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [conf,setConf]=useState("");
  const [show,setShow]=useState(false); const [busy,setBusy]=useState(false);
  const [err,setErr]=useState(""); const [info,setInfo]=useState("");
  const clear=()=>{setErr("");setInfo("");};

  const submit=async()=>{
    clear();
    if(!email.trim()||!pw) return setErr("Please fill in all fields.");
    if(tab==="register"&&pw!==conf) return setErr("Passwords do not match.");
    if(pw.length<6) return setErr("Password must be at least 6 characters.");
    setBusy(true);
    try{
      if(tab==="register"){
        const d=await SB.signUp(email,pw);
        if(d.error) return setErr(d.error.message||"Registration failed.");
        if(d.access_token) onAuth(d);
        else{setInfo("Account created! Confirm your email then sign in.");setTab("login");}
      }else{
        const d=await SB.signIn(email,pw);
        if(d.error) return setErr(d.error.message||"Login failed.");
        if(!d.access_token) return setErr("Login failed. Check credentials or confirm email.");
        onAuth(d);
      }
    }catch{setErr("Network error — check your Supabase URL.");}
    finally{setBusy(false);}
  };

  return (
    <div style={{minHeight:"100vh",background:"#060E1A",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800&family=Inter:wght@400;500;600&display=swap');*{box-sizing:border-box;margin:0;}::placeholder{color:#3D4A5C;}input{outline:none;}`}</style>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:52,height:52,borderRadius:14,background:"linear-gradient(135deg,#4ADE80,#22D3EE)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}><ArrowRight size={24} style={{color:"#0A1628"}}/></div>
          <h1 style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:26,color:"#EEF2FF",marginBottom:6}}>AppliTrack</h1>
          <p style={{color:"#6B7280",fontSize:14}}>Your personal application command centre</p>
        </div>
        <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:18,padding:28}}>
          <div style={{display:"flex",background:"rgba(255,255,255,0.05)",borderRadius:10,padding:3,marginBottom:22,gap:2}}>
            {["login","register"].map(t=>(
              <button key={t} onClick={()=>{setTab(t);clear();}} style={{flex:1,padding:"8px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",transition:"all 0.18s",background:tab===t?"#4ADE80":"transparent",color:tab===t?"#0A1628":"#9AA3B2"}}>
                {t==="login"?"Sign In":"Register"}
              </button>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div><label style={S.label}>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={S.input} onFocus={iFocus} onBlur={iBlur} onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
            <div><label style={S.label}>Password</label>
              <div style={{position:"relative"}}>
                <input type={show?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} placeholder="At least 6 characters" style={{...S.input,paddingRight:42}} onFocus={iFocus} onBlur={iBlur} onKeyDown={e=>e.key==="Enter"&&submit()}/>
                <button onClick={()=>setShow(!show)} style={{...S.iBtn,position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",padding:3}}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button>
              </div>
            </div>
            {tab==="register"&&<div><label style={S.label}>Confirm Password</label><input type={show?"text":"password"} value={conf} onChange={e=>setConf(e.target.value)} placeholder="Repeat password" style={S.input} onFocus={iFocus} onBlur={iBlur} onKeyDown={e=>e.key==="Enter"&&submit()}/></div>}
            {err&&<div style={{background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.25)",borderRadius:8,padding:"10px 13px",color:"#FF8080",fontSize:13}}>{err}</div>}
            {info&&<div style={{background:"rgba(46,204,113,0.1)",border:"1px solid rgba(46,204,113,0.25)",borderRadius:8,padding:"10px 13px",color:"#4ADE80",fontSize:13}}>{info}</div>}
            <button onClick={submit} disabled={busy} style={{...S.btn("p"),width:"100%",justifyContent:"center",padding:"12px",fontSize:14,fontWeight:800,marginTop:4,opacity:busy?0.7:1}}>
              {busy?"Please wait…":tab==="login"?"Sign In →":"Create Account →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// NOTIFICATION BANNER
// ══════════════════════════════════════════════════
function NotifBanner({streak,appliedToday,onDismiss}) {
  if(appliedToday&&streak<2) return null;
  const [color,msg] = appliedToday
    ? ["#4ADE80", `🔥 ${streak}-day streak! You're on a roll — keep it going.`]
    : streak>0
      ? ["#F5A623", `⚡ Don't break your ${streak}-day streak! Add an application today.`]
      : ["#A78BFA", "💡 Start your streak today — add a job or university application!"];
  return (
    <div style={{background:`${color}12`,border:`1px solid ${color}30`,borderRadius:10,padding:"10px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
      <p style={{color,fontSize:13,fontWeight:600,flex:1}}>{msg}</p>
      <button onClick={onDismiss} style={{...S.iBtn,padding:3}} onMouseEnter={e=>e.currentTarget.style.color="#EEF2FF"} onMouseLeave={e=>e.currentTarget.style.color="#9AA3B2"}><X size={16}/></button>
    </div>
  );
}

// ══════════════════════════════════════════════════
// HEATMAP WIDGET
// ══════════════════════════════════════════════════
function Heatmap({allApps}) {
  const {streak,appliedToday}=calcStreak(allApps);
  const cols=buildGrid(allApps,20);
  const [hovered,setHovered]=useState(null);

  const total=allApps.length;
  const thisWeek=allApps.filter(a=>{const d=new Date(a.created_at);return(new Date()-d)<7*86400000;}).length;

  return (
    <div style={{...S.card,marginBottom:16,padding:"16px 20px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:20}}>🔥</span>
            <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:22,color:"#EEF2FF"}}>{streak}</span>
            <span style={{color:"#9AA3B2",fontSize:12,marginLeft:2}}>day streak</span>
          </div>
          {appliedToday&&<span style={{background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.25)",color:"#4ADE80",fontSize:11,fontWeight:700,padding:"2px 9px",borderRadius:20}}>✓ Applied today</span>}
        </div>
        <div style={{display:"flex",gap:16}}>
          <div style={{textAlign:"right"}}><p style={{color:"#9AA3B2",fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>This week</p><p style={{color:"#EEF2FF",fontWeight:700,fontSize:16,fontFamily:"'Space Grotesk',sans-serif"}}>{thisWeek}</p></div>
          <div style={{textAlign:"right"}}><p style={{color:"#9AA3B2",fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>All time</p><p style={{color:"#EEF2FF",fontWeight:700,fontSize:16,fontFamily:"'Space Grotesk',sans-serif"}}>{total}</p></div>
        </div>
      </div>

      <div style={{overflowX:"auto"}}>
        <div style={{display:"flex",gap:3,minWidth:"fit-content"}}>
          {cols.map((week,wi)=>(
            <div key={wi} style={{display:"flex",flexDirection:"column",gap:3}}>
              {week.map((cell,di)=>(
                <div key={di}
                  onMouseEnter={()=>setHovered(cell)}
                  onMouseLeave={()=>setHovered(null)}
                  style={{width:12,height:12,borderRadius:2,background:cellClr(cell.count),cursor:"default",boxShadow:cell.isToday?"0 0 0 1.5px #4ADE80":undefined,transition:"opacity 0.1s",opacity:hovered&&hovered.date!==cell.date?0.6:1}}
                />
              ))}
            </div>
          ))}
        </div>
        {hovered&&hovered.count>0&&(
          <p style={{color:"#9AA3B2",fontSize:11,marginTop:8}}>
            {hovered.count} application{hovered.count!==1?"s":""} on {new Date(hovered.date+"T12:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}
          </p>
        )}
        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8,justifyContent:"flex-end"}}>
          <span style={{color:"#6B7280",fontSize:10}}>Less</span>
          {[0,1,2,4].map(n=><div key={n} style={{width:10,height:10,borderRadius:2,background:cellClr(n)}}/>)}
          <span style={{color:"#6B7280",fontSize:10}}>More</span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// STATUS BADGE
// ══════════════════════════════════════════════════
function Badge({status}) {
  const s=STATUS[status]||STATUS.processing;
  return <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,color:s.color,background:s.bg,border:`1px solid ${s.color}30`}}><s.Icon size={10}/>{s.label}</span>;
}

// ══════════════════════════════════════════════════
// SKILLS PANEL  (inline on card)
// ══════════════════════════════════════════════════
function SkillsPanel({app}) {
  const [skills,setSkills]=useState(null);
  const [busy,setBusy]=useState(false);
  const [open,setOpen]=useState(false);

  const fetch_=async()=>{
    if(open){setOpen(false);return;}
    setOpen(true);
    if(skills) return;
    setBusy(true);
    try{
      const res=await claude([{role:"user",content:`Role: "${app.role}" at "${app.entity}". List exactly 6 key skills. JSON array only:\n[{"skill":"Python","level":"essential","reason":"..."},...]`}],
        "You are a career coach. Return ONLY a valid JSON array, no markdown, no backticks, no extra text.",true);
      setSkills(Array.isArray(res)?res:[]);
    }catch{setSkills([]);}
    setBusy(false);
  };

  const lvlClr=l=>l==="essential"?"#4ADE80":l==="important"?"#60A5FA":"#A78BFA";

  return (
    <div style={{marginTop:8}}>
      <button onClick={fetch_} style={{...S.btn(),padding:"4px 10px",fontSize:11,color:open?"#FBBF24":"#9AA3B2",border:`1px solid ${open?"rgba(251,191,36,0.3)":"rgba(255,255,255,0.08)"}`,background:open?"rgba(251,191,36,0.07)":"transparent"}}>
        {open?"Hide":"Suggest"} Skills
      </button>
      {open&&(
        <div style={{marginTop:10,padding:"12px 14px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10}}>
          {busy?<p style={{color:"#9AA3B2",fontSize:12}}>Analysing role requirements…</p>
          :skills&&skills.length>0?(
            <>
              <p style={{...S.label,marginBottom:10}}>Key Skills for this Role</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {skills.map((s,i)=>(
                  <div key={i} title={s.reason} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:`${lvlClr(s.level)}15`,border:`1px solid ${lvlClr(s.level)}30`,color:lvlClr(s.level),cursor:"help"}}>
                    {s.skill}
                  </div>
                ))}
              </div>
              <p style={{color:"#6B7280",fontSize:11,marginTop:8}}>🟢 Essential  🔵 Important  🟣 Nice to have · Hover for details</p>
            </>
          ):<p style={{color:"#9AA3B2",fontSize:12}}>Could not load skills. Try again.</p>}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════
// APPLICATION CARD
// ══════════════════════════════════════════════════
function AppCard({app,cat,onEdit,onDelete,onResume,onAI,onInterview}) {
  const [hov,setHov]=useState(false);
  const init=(app.entity||"?").slice(0,2).toUpperCase();
  const hues=["#818CF8","#34D399","#60A5FA","#F472B6","#FBBF24","#FB923C","#A78BFA"];
  const clr=hues[(app.entity?.charCodeAt(0)||0)%hues.length];
  return (
    <div style={{...S.card,background:hov?"rgba(255,255,255,0.07)":S.card.background,transition:"background 0.18s"}} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <div style={{display:"flex",gap:13}}>
        <div style={{width:44,height:44,borderRadius:11,flexShrink:0,background:`${clr}22`,border:`1px solid ${clr}44`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:clr,fontFamily:"'Space Grotesk',sans-serif"}}>{init}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
            <div><p style={{color:"#EEF2FF",fontWeight:700,fontSize:15,margin:0,fontFamily:"'Space Grotesk',sans-serif"}}>{app.entity}</p><p style={{color:"#9AA3B2",fontSize:13,margin:"2px 0 0"}}>{app.role}</p></div>
            <Badge status={app.status}/>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"4px 14px",marginTop:8}}>
            {app.date&&<span style={{color:"#6B7280",fontSize:12}}>📅 {new Date(app.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>}
            {app.location&&<span style={{color:"#6B7280",fontSize:12}}><MapPin size={11} style={{display:"inline",verticalAlign:-1}}/> {app.location}</span>}
            {app.link&&<a href={app.link} target="_blank" rel="noopener noreferrer" style={{color:"#60A5FA",fontSize:12,textDecoration:"none"}}><Link2 size={11} style={{display:"inline",verticalAlign:-1}}/> Link</a>}
          </div>
          {app.notes&&<p style={{color:"#6B7280",fontSize:12,marginTop:7,lineHeight:1.5}}>{app.notes.length>100?app.notes.slice(0,97)+"…":app.notes}</p>}

          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:10,flexWrap:"wrap"}}>
            <button onClick={()=>onResume(app)} style={{...S.btn(),padding:"4px 10px",fontSize:11,color:app.resume_name?"#00D4AA":"#6B7280",border:`1px solid ${app.resume_name?"rgba(0,212,170,0.25)":"rgba(255,255,255,0.08)"}`,background:app.resume_name?"rgba(0,212,170,0.07)":"transparent"}}>
              {app.resume_name?<><FileText size={12}/>{app.resume_name.length>16?app.resume_name.slice(0,13)+"…":app.resume_name}</>:<><Upload size={12}/>Attach {cat.docLabel}</>}
            </button>
            <div style={{display:"flex",gap:5,marginLeft:"auto"}}>
              <button onClick={()=>onInterview(app)} style={{...S.btn("o"),padding:"4px 10px",fontSize:11}}><Mic size={11}/> Interview</button>
              <button onClick={()=>onAI(app)} style={{...S.btn("v"),padding:"4px 10px",fontSize:11}}><Sparkles size={11}/> AI Help</button>
              <button onClick={()=>onEdit(app)} style={S.iBtn} onMouseEnter={e=>e.currentTarget.style.color="#60A5FA"} onMouseLeave={e=>e.currentTarget.style.color="#9AA3B2"}><Edit3 size={15}/></button>
              <button onClick={()=>onDelete(app.id)} style={S.iBtn} onMouseEnter={e=>e.currentTarget.style.color="#FF6B6B"} onMouseLeave={e=>e.currentTarget.style.color="#9AA3B2"}><Trash2 size={15}/></button>
            </div>
          </div>
          <SkillsPanel app={app}/>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// ADD / EDIT MODAL
// ══════════════════════════════════════════════════
function AppModal({open,onClose,onSave,cat,data}) {
  const blank={entity:"",role:"",status:"processing",date:new Date().toISOString().split("T")[0],location:"",link:"",notes:""};
  const [form,setForm]=useState(blank);
  const [file,setFile]=useState(null);
  const [saving,setSaving]=useState(false);
  const fileRef=useRef();
  const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  const submit=async()=>{ if(!form.entity.trim()) return alert(`Enter a ${cat.entityLabel} name.`); setSaving(true); try{await onSave(form,file);}catch(e){alert("Error: "+e.message);} setSaving(false); };
  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:80,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)"}} onClick={onClose}/>
      <div style={{position:"relative",zIndex:1,background:"#0D1B2A",border:"1px solid rgba(255,255,255,0.1)",borderRadius:18,padding:26,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <h2 style={{color:"#EEF2FF",fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:20}}>{data?"Edit":"Add"} Application</h2>
          <button style={S.iBtn} onClick={onClose}><X size={20}/></button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
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
            <div onClick={()=>fileRef.current?.click()} style={{border:"1px dashed rgba(74,222,128,0.3)",borderRadius:11,padding:18,textAlign:"center",cursor:"pointer",background:"rgba(74,222,128,0.03)"}}>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={e=>{if(e.target.files[0])setFile(e.target.files[0]);}}/>
              {file?<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,color:"#4ADE80"}}><FileText size={18}/><span style={{fontSize:13,fontWeight:600}}>{file.name}</span><button onClick={e=>{e.stopPropagation();setFile(null);}} style={{...S.iBtn,color:"#FF6B6B",padding:2}}><X size={14}/></button></div>
              :data?.resume_name?<p style={{color:"#9AA3B2",fontSize:13}}>Current: <span style={{color:"#4ADE80"}}>{data.resume_name}</span> — click to replace</p>
              :<><Upload size={22} style={{color:"#6B7280",margin:"0 auto 8px",display:"block"}}/><p style={{color:"#6B7280",fontSize:13}}>Click to upload</p></>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:22}}>
          <button onClick={onClose} style={{...S.btn(),flex:1,justifyContent:"center",padding:"11px"}}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{...S.btn("p"),flex:1,justifyContent:"center",padding:"11px",fontWeight:800,opacity:saving?0.7:1}}>{saving?"Saving…":data?"Save Changes":"Add Application"}</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// RESUME MODAL
// ══════════════════════════════════════════════════
function ResumeModal({app,token,onClose}) {
  const [url,setUrl]=useState(null); const [busy,setBusy]=useState(false);
  useEffect(() => {
    if (!app?.resume_path) return;
    let cancelled = false;
    const loadUrl = async () => {
      setBusy(true);
      setUrl(null);
      const u = await SB.getSignedUrl(token, app.resume_path);
      if (!cancelled) {
        setUrl(u);
        setBusy(false);
      }
    };
    loadUrl();
    return () => { cancelled = true; };
  }, [app?.resume_path, token]);
  if(!app) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.7)"}} onClick={onClose}/>
      <div style={{position:"relative",zIndex:1,background:"#0D1B2A",border:"1px solid rgba(255,255,255,0.1)",borderRadius:18,padding:26,maxWidth:380,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h3 style={{color:"#EEF2FF",fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:18}}>Attached Document</h3><button style={S.iBtn} onClick={onClose}><X size={20}/></button></div>
        <div style={{background:"rgba(74,222,128,0.06)",border:"1px solid rgba(74,222,128,0.2)",borderRadius:12,padding:20,textAlign:"center",marginBottom:18}}>
          <FileText size={40} style={{color:"#4ADE80",margin:"0 auto 10px",display:"block"}}/>
          <p style={{color:"#EEF2FF",fontWeight:700,marginBottom:4}}>{app.resume_name}</p>
          <p style={{color:"#9AA3B2",fontSize:13}}>{app.entity} — {app.role}</p>
        </div>
        {busy?<p style={{color:"#9AA3B2",textAlign:"center",fontSize:13}}>Generating link…</p>
        :url?<a href={url} download={app.resume_name} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none",display:"block"}}><button style={{...S.btn("p"),width:"100%",justifyContent:"center",padding:"12px",fontWeight:800}}><Download size={16}/>Download</button></a>
        :<p style={{color:"#9AA3B2",textAlign:"center",fontSize:13}}>No file found.</p>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// MOCK INTERVIEW MODAL
// ══════════════════════════════════════════════════
function InterviewModal({open,onClose,initialApp}) {
  const [phase,setPhase]=useState("setup"); // setup | asking | thinking | feedback | done
  const [iType,setIType]=useState("behavioral");
  const [company,setCompany]=useState("");
  const [role,setRole]=useState("");
  const [answer,setAnswer]=useState("");
  const [qNum,setQNum]=useState(0);
  const [question,setQuestion]=useState("");
  const [tip,setTip]=useState("");
  const [feedback,setFeedback]=useState(null); // {feedback,score}
  const [scores,setScores]=useState([]);
  const [summary,setSummary]=useState(null);
  const [history,setHistory]=useState([]); // claude messages

  useEffect(()=>{
    if(open&&initialApp){setCompany(initialApp.entity||"");setRole(initialApp.role||"");}
    if(!open){setPhase("setup");setQNum(0);setScores([]);setHistory([]);setFeedback(null);setSummary(null);setAnswer("");}
  },[open,initialApp?.id]);

  const sysPrompt=`You are a professional ${iType} interviewer at ${company||"a top company"} hiring for ${role||"this role"}. Conduct exactly 5 questions.\n\nRespond ONLY with valid JSON, no markdown.\n\nAfter user answers (questions 1-4):\n{"feedback":"2-3 sentences","score":4,"nextQuestion":"...","tip":"short tip","done":false}\n\nAfter question 5 answer:\n{"feedback":"...","score":3,"overallScore":3.8,"strengths":["...","..."],"improvements":["...","..."],"done":true}`;

  const startInterview=async()=>{
    setPhase("thinking");
    try{
      const d=await claude([{role:"user",content:"Begin the interview. Ask your first question. Respond with JSON: {\"question\":\"...\",\"tip\":\"...\"}"}],sysPrompt,true);
      if(!d){throw new Error("No response");}
      setQuestion(d.question||"Tell me about yourself.");
      setTip(d.tip||"");
      setHistory([{role:"user",content:"Begin the interview."},{role:"assistant",content:JSON.stringify(d)}]);
      setQNum(1); setPhase("asking");
    }catch{setQuestion("Tell me about yourself and why you are interested in this role.");setTip("");setQNum(1);setPhase("asking");}
  };

  const submitAnswer=async()=>{
    if(!answer.trim()) return;
    setPhase("thinking");
    const userMsg={role:"user",content:`My answer: ${answer}`};
    const newHist=[...history,userMsg];
    try{
      const d=await claude(newHist,sysPrompt,true);
      if(!d) throw new Error();
      const newScores=[...scores,d.score||3];
      setScores(newScores);
      if(d.done){
        setSummary({...d,scores:newScores,avg:newScores.reduce((a,b)=>a+b,0)/newScores.length});
        setHistory([...newHist,{role:"assistant",content:JSON.stringify(d)}]);
        setFeedback({feedback:d.feedback,score:d.score||3});
        setPhase("done");
      }else{
        setFeedback({feedback:d.feedback,score:d.score||3});
        setHistory([...newHist,{role:"assistant",content:JSON.stringify(d)}]);
        setQuestion(d.nextQuestion||"Tell me more about your experience.");
        setTip(d.tip||"");
        setQNum(q=>q+1);
        setPhase("feedback");
      }
    }catch{setFeedback({feedback:"Good effort! Keep your answer structured and specific.",score:3});setPhase("feedback");}
    setAnswer("");
  };

  const stars=(n)=>[1,2,3,4,5].map(i=><Star key={i} size={14} fill={i<=n?"#FBBF24":"transparent"} style={{color:"#FBBF24"}}/>);

  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(8px)"}}>
      <div style={{background:"#0A1628",border:"1px solid rgba(255,255,255,0.1)",borderRadius:20,width:"100%",maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
        {/* Header */}
        <div style={{padding:"18px 22px",borderBottom:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:12,background:"rgba(251,146,60,0.04)"}}>
          <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#FB923C,#F59E0B)",display:"flex",alignItems:"center",justifyContent:"center"}}><Mic size={18} style={{color:"#fff"}}/></div>
          <div style={{flex:1}}>
            <h3 style={{color:"#EEF2FF",fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:16}}>Mock Interview</h3>
            {phase!=="setup"&&<p style={{color:"#FB923C",fontSize:12}}>{company||"Company"} · {role||"Role"} · {IV_TYPES.find(t=>t.id===iType)?.label} · Q{qNum}/5</p>}
          </div>
          {phase!=="thinking"&&<button style={S.iBtn} onClick={onClose}><X size={20}/></button>}
        </div>

        <div style={{padding:24}}>

          {/* SETUP */}
          {phase==="setup"&&(
            <div style={{display:"flex",flexDirection:"column",gap:18}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                <div><label style={S.label}>Company / University</label><input value={company} onChange={e=>setCompany(e.target.value)} placeholder="e.g. Google" style={S.input} onFocus={iFocus} onBlur={iBlur}/></div>
                <div><label style={S.label}>Role / Program</label><input value={role} onChange={e=>setRole(e.target.value)} placeholder="e.g. Software Engineer" style={S.input} onFocus={iFocus} onBlur={iBlur}/></div>
              </div>
              <div>
                <label style={{...S.label,marginBottom:10}}>Interview Type</label>
                <div style={{display:"flex",gap:10}}>
                  {IV_TYPES.map(t=>(
                    <button key={t.id} onClick={()=>setIType(t.id)} style={{flex:1,padding:"14px 8px",borderRadius:12,border:`2px solid ${iType===t.id?"#FB923C":"rgba(255,255,255,0.1)"}`,background:iType===t.id?"rgba(251,146,60,0.1)":"rgba(255,255,255,0.03)",cursor:"pointer",textAlign:"center",transition:"all 0.2s"}}>
                      <div style={{fontSize:22,marginBottom:6}}>{t.emoji}</div>
                      <p style={{color:iType===t.id?"#FB923C":"#EEF2FF",fontWeight:700,fontSize:13,marginBottom:3}}>{t.label}</p>
                      <p style={{color:"#6B7280",fontSize:11}}>{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:14}}>
                <p style={{color:"#9AA3B2",fontSize:13,lineHeight:1.6}}>You'll get <strong style={{color:"#EEF2FF"}}>5 questions</strong> with individual feedback and scores. At the end, you'll receive an overall assessment with strengths and areas to improve.</p>
              </div>
              <button onClick={startInterview} style={{...S.btn("o"),width:"100%",justifyContent:"center",padding:"13px",fontSize:15,fontWeight:800}}><Mic size={17}/> Start Interview</button>
            </div>
          )}

          {/* THINKING */}
          {phase==="thinking"&&(
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{width:50,height:50,borderRadius:14,background:"linear-gradient(135deg,#FB923C,#F59E0B)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><Mic size={24} style={{color:"#fff"}}/></div>
              <p style={{color:"#EEF2FF",fontWeight:600,marginBottom:8}}>Thinking…</p>
              <div style={{display:"flex",gap:6,justifyContent:"center"}}>{[0,0.2,0.4].map(d=><span key={d} style={{width:8,height:8,borderRadius:"50%",background:"#FB923C",display:"block",animation:`dot 1.2s ${d}s infinite`}}/>)}</div>
            </div>
          )}

          {/* ASKING */}
          {phase==="asking"&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={{background:"rgba(251,146,60,0.08)",border:"1px solid rgba(251,146,60,0.2)",borderRadius:14,padding:20}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{color:"#FB923C",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>Question {qNum} of 5</span>
                </div>
                <p style={{color:"#EEF2FF",fontSize:16,lineHeight:1.7,fontWeight:500}}>{question}</p>
                {tip&&<p style={{color:"#9AA3B2",fontSize:12,marginTop:10,background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"8px 12px"}}>💡 {tip}</p>}
              </div>
              <div>
                <label style={S.label}>Your Answer</label>
                <textarea value={answer} onChange={e=>setAnswer(e.target.value)} rows={5} placeholder="Type your answer here — take your time…" style={{...S.input,resize:"vertical",lineHeight:1.6}} onFocus={iFocus} onBlur={iBlur}/>
              </div>
              <button onClick={submitAnswer} disabled={!answer.trim()} style={{...S.btn("o"),width:"100%",justifyContent:"center",padding:"12px",fontWeight:800,opacity:!answer.trim()?0.5:1}}>Submit Answer <ChevronRight size={16}/></button>
            </div>
          )}

          {/* FEEDBACK (between questions) */}
          {phase==="feedback"&&feedback&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:20}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <span style={{color:"#9AA3B2",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>Feedback</span>
                  <div style={{display:"flex",gap:2,marginLeft:"auto"}}>{stars(feedback.score)}</div>
                  <span style={{color:"#FBBF24",fontWeight:700,fontSize:13}}>{feedback.score}/5</span>
                </div>
                <p style={{color:"#CBD5E1",fontSize:14,lineHeight:1.7}}>{feedback.feedback}</p>
              </div>
              <button onClick={()=>setPhase("asking")} style={{...S.btn("p"),width:"100%",justifyContent:"center",padding:"12px",fontWeight:800}}>Next Question <ChevronRight size={16}/></button>
            </div>
          )}

          {/* DONE — summary */}
          {phase==="done"&&summary&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {feedback&&<div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:16}}>
                <p style={{color:"#9AA3B2",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Final Question Feedback</p>
                <div style={{display:"flex",gap:2,marginBottom:6}}>{stars(feedback.score)}</div>
                <p style={{color:"#CBD5E1",fontSize:13,lineHeight:1.6}}>{feedback.feedback}</p>
              </div>}

              <div style={{background:"linear-gradient(135deg,rgba(251,146,60,0.1),rgba(245,158,11,0.08))",border:"1px solid rgba(251,146,60,0.25)",borderRadius:16,padding:20,textAlign:"center"}}>
                <p style={{color:"#9AA3B2",fontSize:12,marginBottom:6}}>Overall Score</p>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:48,color:"#FB923C",lineHeight:1}}>{summary.overallScore?.toFixed(1)||summary.avg?.toFixed(1)||"—"}<span style={{fontSize:24,color:"#9AA3B2"}}>/5</span></div>
                <div style={{display:"flex",gap:4,justifyContent:"center",marginTop:8}}>{stars(Math.round(summary.overallScore||summary.avg||3))}</div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div style={{background:"rgba(74,222,128,0.06)",border:"1px solid rgba(74,222,128,0.2)",borderRadius:12,padding:14}}>
                  <p style={{color:"#4ADE80",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>✅ Strengths</p>
                  {(summary.strengths||[]).map((s,i)=><p key={i} style={{color:"#CBD5E1",fontSize:13,marginBottom:6,lineHeight:1.4}}>· {s}</p>)}
                </div>
                <div style={{background:"rgba(167,139,250,0.06)",border:"1px solid rgba(167,139,250,0.2)",borderRadius:12,padding:14}}>
                  <p style={{color:"#A78BFA",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>🎯 Improve On</p>
                  {(summary.improvements||[]).map((s,i)=><p key={i} style={{color:"#CBD5E1",fontSize:13,marginBottom:6,lineHeight:1.4}}>· {s}</p>)}
                </div>
              </div>

              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>{setPhase("setup");setScores([]);setHistory([]);setFeedback(null);setSummary(null);setAnswer("");setQNum(0);}} style={{...S.btn(),flex:1,justifyContent:"center",padding:"11px"}}>Try Again</button>
                <button onClick={onClose} style={{...S.btn("p"),flex:1,justifyContent:"center",padding:"11px",fontWeight:800}}>Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// AI ASSISTANT PANEL
// ══════════════════════════════════════════════════
function AIPanel({open,onClose,ctxApp,category}) {
  const cat=CATS[category];
  const greeting=`👋 Hi! I'm your AI Career Assistant.\n\nI can help you tailor your ${cat.docLabel}, write cover letters, motivation letters, prep for interviews, or answer any question.\n\n${ctxApp?`I have context for **${ctxApp.entity}** — **${ctxApp.role}**. Use a quick action or ask anything!`:"Select a specific application's 'AI Help' button for context-aware advice."}`;
  const [msgs,setMsgs]=useState([{role:"assistant",content:greeting}]);
  const [input,setInput]=useState(""); const [busy,setBusy]=useState(false);
  const endRef=useRef();
  useEffect(()=>{setMsgs([{role:"assistant",content:greeting}]);setInput("");},[ctxApp?.id,category]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);

  const sys=`You are an expert career and university application advisor. Help with resumes/CVs, cover letters, motivation letters, interview prep, and application strategy for ${category==="jobs"?"job":"university"} applications. Be warm, specific, concise (≤300 words unless drafting a document). Use bullet points where helpful.${ctxApp?`\n\nCurrent application:\n- ${cat.entityLabel}: ${ctxApp.entity}\n- ${cat.roleLabel}: ${ctxApp.role}\n- Status: ${STATUS[ctxApp.status]?.label}${ctxApp.location?"\n- Location: "+ctxApp.location:""}${ctxApp.notes?"\n- Notes: "+ctxApp.notes:""}`:""}`; 

  const ACTIONS=[
    {Icon:FileText,label:"Tailor Resume",prompt:"Help me tailor my resume/CV for this specific application. What should I highlight?"},
    {Icon:PenTool,label:"Cover Letter",prompt:"Write a professional cover letter for this application."},
    {Icon:BookOpen,label:"Motivation Letter",prompt:"Help me write a strong motivation letter for this application."},
    {Icon:Target,label:"Suggest Skills",prompt:"What are the top 8 skills I should have or develop for this specific role? Give practical advice on each."},
  ];

  const send=async(text)=>{
    const msg=(text||input).trim(); if(!msg||busy) return; setInput("");
    const updated=[...msgs,{role:"user",content:msg}]; setMsgs(updated); setBusy(true);
    try{const apiMsgs=updated.filter((m,i)=>!(i===0&&m.role==="assistant")).map(m=>({role:m.role,content:m.content}));const reply=await claude(apiMsgs,sys);setMsgs(m=>[...m,{role:"assistant",content:reply}]);}
    catch{setMsgs(m=>[...m,{role:"assistant",content:"Something went wrong — try again."}]);}
    setBusy(false);
  };

  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:150,display:"flex",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.45)"}} onClick={onClose}/>
      <div style={{position:"relative",zIndex:1,width:"min(430px,100vw)",height:"100%",background:"#080F1C",borderLeft:"1px solid rgba(255,255,255,0.08)",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"16px 18px",borderBottom:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#818CF8,#A78BFA)",display:"flex",alignItems:"center",justifyContent:"center"}}><Sparkles size={18} style={{color:"#fff"}}/></div>
          <div style={{flex:1,minWidth:0}}>
            <h3 style={{color:"#EEF2FF",fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:15}}>AI Career Assistant</h3>
            {ctxApp&&<p style={{color:"#A78BFA",fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Context: {ctxApp.entity} — {ctxApp.role}</p>}
          </div>
          <button style={S.iBtn} onClick={onClose}><X size={18}/></button>
        </div>
        {ctxApp&&<div style={{padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
          <p style={{...S.label,marginBottom:8}}>Quick Actions</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {ACTIONS.map(a=><button key={a.label} onClick={()=>send(a.prompt)} style={{...S.btn(),padding:"5px 10px",fontSize:11,color:"#C4B5FD",border:"1px solid rgba(167,139,250,0.2)",background:"rgba(167,139,250,0.07)"}}><a.Icon size={11}/>{a.label}</button>)}
          </div>
        </div>}
        <div style={{flex:1,overflowY:"auto",padding:14,display:"flex",flexDirection:"column",gap:10}}>
          {msgs.map((m,i)=>(
            <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",gap:8}}>
              {m.role==="assistant"&&<div style={{width:26,height:26,borderRadius:7,background:"linear-gradient(135deg,#818CF8,#A78BFA)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:4}}><Sparkles size={12} style={{color:"#fff"}}/></div>}
              <div style={{maxWidth:"85%",padding:"10px 13px",fontSize:13,lineHeight:1.65,borderRadius:m.role==="user"?"13px 13px 4px 13px":"13px 13px 13px 4px",background:m.role==="user"?"linear-gradient(135deg,#4ADE80,#22C55E)":"rgba(255,255,255,0.06)",color:m.role==="user"?"#0A1628":"#CBD5E1",fontWeight:m.role==="user"?600:400,border:m.role==="assistant"?"1px solid rgba(255,255,255,0.07)":"none",whiteSpace:"pre-wrap"}}>
                {m.content.replace(/\*\*(.*?)\*\*/g,"$1")}
              </div>
            </div>
          ))}
          {busy&&<div style={{display:"flex",gap:8}}><div style={{width:26,height:26,borderRadius:7,background:"linear-gradient(135deg,#818CF8,#A78BFA)",display:"flex",alignItems:"center",justifyContent:"center"}}><Sparkles size={12} style={{color:"#fff"}}/></div><div style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:"13px 13px 13px 4px",padding:"10px 13px",display:"flex",gap:5,alignItems:"center"}}>{[0,0.2,0.4].map(d=><span key={d} style={{width:6,height:6,borderRadius:"50%",background:"#A78BFA",display:"block",animation:`dot 1.2s ${d}s infinite`}}/>)}</div></div>}
          <div ref={endRef}/>
        </div>
        <div style={{padding:"12px 14px",borderTop:"1px solid rgba(255,255,255,0.08)",flexShrink:0}}>
          <div style={{display:"flex",gap:8}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask anything about your application…" style={{...S.input,flex:1,background:"rgba(255,255,255,0.05)"}}/>
            <button onClick={()=>send()} disabled={!input.trim()||busy} style={{...S.btn(input.trim()?"p":"g"),padding:"10px 14px",opacity:!input.trim()||busy?0.5:1}}><Send size={15}/></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════
export default function AppliTrack() {
  const [session,setSession]=useState(null); const [user,setUser]=useState(null); const [booting,setBooting]=useState(true);
  const [cat,setCat]=useState("jobs");
  const [apps,setApps]=useState([]); const [allApps,setAllApps]=useState([]);
  const [loading,setLoading]=useState(false);
  const [modal,setModal]=useState(false); const [editData,setEditData]=useState(null);
  const [aiOpen,setAiOpen]=useState(false); const [aiCtx,setAiCtx]=useState(null);
  const [ivOpen,setIvOpen]=useState(false); const [ivApp,setIvApp]=useState(null);
  const [resumeApp,setResumeApp]=useState(null);
  const [filter,setFilter]=useState("all"); const [search,setSearch]=useState("");
  const [deleteId,setDeleteId]=useState(null);
  const [notifDismissed,setNotifDismissed]=useState(false);

  const token=session?.access_token; const userId=user?.id;
  const category=CATS[cat];
  const {streak,appliedToday}=calcStreak(allApps);

  useEffect(()=>{sessionCache.load().then(s=>{if(s?.access_token){setSession(s);setUser(s.user);}setBooting(false);});},[]);

  // Load apps when auth/category changes
  useEffect(()=>{
    if(!token) return;
    setLoading(true);
    Promise.all([SB.getApps(token,cat),SB.getAllApps(token)])
      .then(([catApps,all])=>{setApps(Array.isArray(catApps)?catApps:[]);setAllApps(Array.isArray(all)?all:[]);})
      .catch(()=>{setApps([]);setAllApps([]);})
      .finally(()=>setLoading(false));
    setFilter("all");setSearch("");
  },[cat,token]);

  const refreshAll=async()=>{
    const [catApps,all]=await Promise.all([SB.getApps(token,cat),SB.getAllApps(token)]);
    setApps(Array.isArray(catApps)?catApps:[]);
    setAllApps(Array.isArray(all)?all:[]);
  };

  const handleAuth=async(sess)=>{ const s={...sess,user:sess.user}; await sessionCache.save(s); setSession(s);setUser(s.user); };
  const handleLogout = async () => {
    try { await SB.signOut(token); } catch (err) {
      console.error(err);
    } await sessionCache.clear(); setSession(null);setUser(null);setApps([]);setAllApps([]); };

  const handleSave=async(form,file)=>{
    if(editData){
      let extra={};
      if(file){try{const p=await SB.uploadFile(token,userId,editData.id,file);extra={resume_name:file.name,resume_path:p};}catch{alert("File upload failed but application saved.");}}
      await SB.updateApp(token,editData.id,{...form,...extra});
    }else{
      const inserted=await SB.addApp(token,{...form,category:cat,user_id:userId});
      if (file && inserted?.id) {
        try { const p = await SB.uploadFile(token, userId, inserted.id, file); await SB.updateApp(token, inserted.id, { resume_name: file.name, resume_path: p }); } catch (err) {
          console.error(err);
        }
}
    }
    await refreshAll(); setModal(false);setEditData(null);
  };

  const confirmDelete=async()=>{
    const app=apps.find(a=>a.id===deleteId);
    if(app?.resume_path) await SB.deleteFile(token,app.resume_path).catch(()=>{});
    await SB.deleteApp(token,deleteId);
    await refreshAll(); setDeleteId(null);
  };

  const stats={total:apps.length,processing:apps.filter(a=>a.status==="processing").length,accepted:apps.filter(a=>a.status==="accepted").length,rejected:apps.filter(a=>a.status==="rejected").length};
  const visible=apps.filter(a=>(filter==="all"||a.status===filter)&&(!search||a.entity?.toLowerCase().includes(search.toLowerCase())||a.role?.toLowerCase().includes(search.toLowerCase())));
  const CatIcon=category.icon;

  if(!IS_CONFIGURED) return <SetupScreen/>;
  if(booting) return <div style={{minHeight:"100vh",background:"#060E1A",display:"flex",alignItems:"center",justifyContent:"center",color:"#6B7280",fontFamily:"Inter,sans-serif"}}>Loading…</div>;
  if(!session) return <AuthScreen onAuth={handleAuth}/>;

  return (
    <div style={{minHeight:"100vh",background:"#060E1A",fontFamily:"'Inter',system-ui,sans-serif",color:"#EEF2FF"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;} ::placeholder{color:#3D4A5C;} input,select,textarea{outline:none;}
        input:focus,select:focus,textarea:focus{border-color:rgba(74,222,128,0.4)!important;}
        select option{background:#0D1B2A;} ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
        @keyframes dot{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} .entry{animation:fadeUp .2s ease;}
      `}</style>

      {/* Header */}
      <header style={{background:"rgba(6,14,26,0.92)",backdropFilter:"blur(18px)",borderBottom:"1px solid rgba(255,255,255,0.07)",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:1900,width:"100%",margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"center",height:60,gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <div style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,#4ADE80,#22D3EE)",display:"flex",alignItems:"center",justifyContent:"center"}}><ArrowRight size={16} style={{color:"#0A1628"}}/></div>
            <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:18,color:"#EEF2FF"}}>AppliTrack</span>
          </div>
          <div style={{display:"flex",background:"rgba(255,255,255,0.05)",borderRadius:10,padding:3,gap:2}}>
            {Object.entries(CATS).map(([k,c])=>{ const Icon=c.icon;const active=cat===k;return <button key={k} onClick={()=>setCat(k)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 13px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit",transition:"all 0.18s",background:active?"#4ADE80":"transparent",color:active?"#0A1628":"#9AA3B2"}}><Icon size={13}/>{c.label}</button>; })}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
            <button onClick={()=>{setIvApp(null);setIvOpen(true);}} style={{...S.btn("o"),padding:"7px 12px",fontSize:12}}><Mic size={14}/> Interview</button>
            <button onClick={()=>{setAiCtx(null);setAiOpen(true);}} style={{...S.btn("v"),padding:"7px 12px",fontSize:12}}><Sparkles size={14}/> AI</button>
            <button onClick={handleLogout} title="Sign out" style={S.iBtn} onMouseEnter={e=>e.currentTarget.style.color="#FF6B6B"} onMouseLeave={e=>e.currentTarget.style.color="#9AA3B2"}><LogOut size={16}/></button>
          </div>
        </div>
      </header>

      <main style={{maxWidth:1900,width:"100%",margin:"0 auto",padding:"20px 24px 60px"}}>

        {/* Notification */}
        {!notifDismissed&&<NotifBanner streak={streak} appliedToday={appliedToday} onDismiss={()=>setNotifDismissed(true)}/>}

        {/* Heatmap */}
        <Heatmap allApps={allApps}/>

        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
          {[{l:"Total",v:stats.total,c:"#818CF8"},{l:"Processing",v:stats.processing,c:"#F5A623"},{l:"Accepted",v:stats.accepted,c:"#4ADE80"},{l:"Rejected",v:stats.rejected,c:"#FF6B6B"}].map(({l,v,c})=>(
            <div key={l} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"12px 14px",textAlign:"center"}}>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:24,color:c,lineHeight:1}}>{v}</div>
              <div style={{color:"#6B7280",fontSize:11,marginTop:4}}>{l}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{position:"relative",flex:"1 1 150px",minWidth:0}}>
            <Search size={14} style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"#3D4A5C",pointerEvents:"none"}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{...S.input,paddingLeft:34}}/>
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {["all",...Object.keys(STATUS)].map(s=>{const active=filter===s;const st=STATUS[s];return <button key={s} onClick={()=>setFilter(s)} style={{...S.btn(),padding:"6px 11px",fontSize:11,background:active?(s==="all"?"#818CF8":st.color):"rgba(255,255,255,0.04)",color:active?(s==="all"?"#fff":"#0A1628"):"#9AA3B2",border:active?"none":"1px solid rgba(255,255,255,0.08)"}}>{s==="all"?"All":st.label}</button>;})}
          </div>
          <button onClick={()=>{setEditData(null);setModal(true);}} style={{...S.btn("p"),padding:"8px 16px",fontWeight:800}}><Plus size={15}/> Add</button>
        </div>

        {/* Application list */}
        {loading?<div style={{textAlign:"center",padding:60,color:"#6B7280"}}>Loading…</div>
        :visible.length===0?(
          <div style={{textAlign:"center",padding:"60px 20px",background:"rgba(255,255,255,0.02)",border:"1px dashed rgba(255,255,255,0.07)",borderRadius:16}}>
            <CatIcon size={38} style={{color:"#3D4A5C",margin:"0 auto 14px",display:"block"}}/>
            <p style={{color:"#9AA3B2",fontWeight:600,fontSize:15,marginBottom:6}}>{apps.length===0?`No ${category.label} Applications Yet`:"No results"}</p>
            <p style={{color:"#3D4A5C",fontSize:13,marginBottom:apps.length===0?20:0}}>{apps.length===0?`Add your first ${cat==="jobs"?"job":"university"} application.`:"Try clearing search or filters."}</p>
            {apps.length===0&&<button onClick={()=>{setEditData(null);setModal(true);}} style={{...S.btn("p"),padding:"10px 20px",fontWeight:800}}><Plus size={15}/> Add Application</button>}
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            {visible.map(app=>(
              <div key={app.id} className="entry">
                <AppCard app={app} cat={category}
                  onEdit={a=>{setEditData(a);setModal(true);}}
                  onDelete={id=>setDeleteId(id)}
                  onResume={a=>setResumeApp(a)}
                  onAI={a=>{setAiCtx(a);setAiOpen(true);}}
                  onInterview={a=>{setIvApp(a);setIvOpen(true);}}/>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      <AppModal open={modal} onClose={()=>{setModal(false);setEditData(null);}} onSave={handleSave} cat={category} data={editData}/>
      <AIPanel open={aiOpen} onClose={()=>setAiOpen(false)} ctxApp={aiCtx} category={cat}/>
      <InterviewModal open={ivOpen} onClose={()=>setIvOpen(false)} initialApp={ivApp}/>
      <ResumeModal app={resumeApp} token={token} onClose={()=>setResumeApp(null)}/>

      {deleteId&&(
        <div style={{position:"fixed",inset:0,zIndex:250,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.65)"}} onClick={()=>setDeleteId(null)}/>
          <div style={{position:"relative",zIndex:1,background:"#0D1B2A",border:"1px solid rgba(255,107,107,0.25)",borderRadius:16,padding:24,maxWidth:"100%",width:"100%"}}>
            <AlertTriangle size={26} style={{color:"#FF6B6B",marginBottom:12}}/>
            <h3 style={{color:"#EEF2FF",fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,marginBottom:8}}>Delete Application?</h3>
            <p style={{color:"#9AA3B2",fontSize:14,marginBottom:20}}>This permanently removes the application and any attached file from storage.</p>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setDeleteId(null)} style={{...S.btn(),flex:1,justifyContent:"center",padding:"10px"}}>Cancel</button>
              <button onClick={confirmDelete} style={{...S.btn("d"),flex:1,justifyContent:"center",padding:"10px",fontWeight:800}}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
