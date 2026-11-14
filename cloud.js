/* Hockey Coach optional cloud teams. Local-only mode remains the default. */
const HockeyCloud=(()=>{
 const URL='https://rnpgyfozdvlhklbemwnk.supabase.co',KEY='sb_publishable_fQRNaBQfOfQX4NxDYSjRIg_2LEd10DM';
 let client=null,user=null,teams=[],team=null,version=0,base=null,busy=false,paused=false,status='Local only',pending=[],channel=null,ready=false;
 const localKey=id=>'hockey-coach-cloud-'+id;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const notify=()=>{let el=document.getElementById('cloud-status');if(el)el.textContent=status};
 const say=x=>{status=x;notify()};
 const sections=['roster','settings','games','practice','history'];
 const subset=(x,k)=>k==='roster'?{players:x.players}:k==='settings'?{settings:x.settings}:k==='practice'?{practiceSessions:x.practiceSessions}:k==='history'?{history:x.history}:{games:x.games,mode:x.mode,goalies:x.goalies,day:x.day,game:x.game,shift:x.shift,seconds:x.seconds};
 const changed=(a,b,k)=>JSON.stringify(subset(a,k))!==JSON.stringify(subset(b,k));
 const permitted=k=>team&&(team.role==='admin'||!!team.assistant_permissions?.[k]);
 function onSave(data){
  if(!team)return;
  localStorage.setItem(localKey(team.id),JSON.stringify(data));
  if(!base)return;
  for(const k of sections)if(changed(data,base,k)){
   const start=busy?1:0;const existing=pending.slice(start).find(p=>p.section===k);
   if(existing)existing.data=clone(data);else pending.push({section:k,data:clone(data)});
  }
  base=clone(data);
  if(pending.length){say(navigator.onLine?'Unsynced changes':'Offline · changes pending');drain()}
 }
 async function drain(){
  if(busy||paused||!client||!team||!navigator.onLine)return;
  busy=true;
  try{
   while(pending.length&&team){
    const p=pending[0];
    if(!permitted(p.section)){paused=true;say('No permission to edit '+p.section+' · local changes preserved');break}
    const {data,error}=await client.rpc('save_hockey_team_data',{p_team:team.id,p_data:p.data,p_expected_version:version,p_section:p.section,p_is_import:false});
    if(error){paused=true;say(error.message.includes('Version conflict')?'Sync conflict · local changes preserved. Export a backup before reloading.':'Sync paused: '+error.message);break}
    version=Number(data);pending.shift();say(pending.length?'Syncing…':'Synced');
   }
  }catch(err){say('Offline or sync unavailable · changes pending')}
  finally{busy=false}
 }
 async function listTeams(){
  if(!client||!user)return;
  const {data,error}=await client.from('team_members').select('team_id,role,teams(id,name,assistant_permissions)').eq('user_id',user.id);
  if(error){say(error.message);return}
  teams=(data||[]).filter(x=>x.teams).map(x=>({...x.teams,role:x.role}));
  if(team){team=teams.find(t=>t.id===team.id)||null;if(!team){window.hockeyCloudSetData(null,null);say('Team access removed')}}
  if(typeof render==='function')render();
 }
 async function init(){
  try{
   const mod=await import('https://esm.sh/@supabase/supabase-js@2.57.0');
   client=mod.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
   client.auth.onAuthStateChange((_event,session)=>{const old=user?.id;user=session?.user||null;if(old!==user?.id){if(!user&&team){team=null;window.hockeyCloudSetData(null,null)}setTimeout(listTeams,0)}});
   const {data}=await client.auth.getUser();user=data?.user||null;ready=true;
   if(user){await listTeams();const last=localStorage.getItem('hockey-coach-last-team');if(last&&teams.some(t=>t.id===last))await selectTeam(last)}
   if(!team)say(user?'Signed in · select a team':'Local only · sign in to sync');
  }catch(err){say('Cloud unavailable · local mode works offline')}
 }
 let pendingEmail='';
 async function signIn(){
  if(!client)return alert('Cloud is still loading. Try again when online.');
  const email=prompt('Email for a six-digit sign-in code:',pendingEmail);if(!email)return;
  pendingEmail=email.trim();
  const {error}=await client.auth.signInWithOtp({email:pendingEmail});
  if(error)return alert('Sign-in error: '+error.message);
  say('Code sent · enter it below');render();
 }
 async function verifyCode(){
  if(!client||!pendingEmail)return alert('Request a code first.');
  const token=prompt('Six-digit code sent to '+pendingEmail+':');if(!token)return;
  const {error}=await client.auth.verifyOtp({email:pendingEmail,token:token.trim(),type:'email'});
  if(error)return alert('Verification failed: '+error.message);
  pendingEmail='';await listTeams();say('Signed in · select or create a team');render();
 }
 async function signOut(){if(!client)return;if(pending.length&&!confirm('Unsynced changes remain on this device. Sign out anyway?'))return;await client.auth.signOut();localStorage.removeItem('hockey-coach-last-team');team=null;pending=[];base=null;window.hockeyCloudSetData(null,null);say('Signed out · local only');render()}
 async function createTeam(){
  if(!user)return alert('Sign in first');
  const name=prompt('New team name:');if(!name?.trim())return;
  const {data,error}=await client.rpc('create_hockey_team',{p_name:name.trim()});
  if(error)return alert(error.message);
  await listTeams();await selectTeam(data);
 }
 async function selectTeam(id){
  if(pending.length&&team?.id!==id)return alert('Sync pending. Stay on this team until changes are synced or export a backup.');
  if(!id){localStorage.removeItem('hockey-coach-last-team');team=null;base=null;pending=[];window.hockeyCloudSetData(null,null);say('Local only');render();return}
  const selected=teams.find(t=>t.id===id);if(!selected)return alert('Team not available');
  const {data,error}=await client.from('team_data').select('data,version,imported_at').eq('team_id',id).single();
  if(error)return alert(error.message);
  team=selected;calendarEvents=[];calendarAttempted=false;calendarFetchedAt=0;localStorage.setItem('hockey-coach-last-team',id);version=Number(data.version);pending=[];paused=false;
  if(data.imported_at){
   base=clone(data.data);window.hockeyCloudSetData(data.data,id);say('Synced');
  }else{base=null;window.hockeyCloudSetData(null,id);say('Team awaits administrator import')}
  if(channel)await client.removeChannel(channel);
  channel=client.channel('hockey-team-'+id).on('postgres_changes',{event:'UPDATE',schema:'public',table:'team_data',filter:'team_id=eq.'+id},()=>refresh()).subscribe();
  render();
  queueMicrotask(()=>{if(team?.id===id&&!calendarAttempted)previewCalendar()});
 }
 async function refresh(){
  if(!team||pending.length||busy||paused)return;
  const id=team.id,{data,error}=await client.from('team_data').select('data,version,imported_at').eq('team_id',id).single();
  if(error||!team||team.id!==id||Number(data.version)===version)return;
  version=Number(data.version);if(data.imported_at){base=clone(data.data);window.hockeyCloudSetData(data.data,id);say('Updated from cloud');render()}
 }
 async function importLocal(){
  if(team?.role!=='admin'||base)return alert('Only administrators can import into an empty team.');
  const raw=localStorage.getItem('hockey-8u-v1');
  if(!raw)return alert('No saved local data found. Use Initialize new team instead.');
  let source;try{source=migrateData(JSON.parse(raw))}catch(err){return alert('Local data is invalid: '+err.message)}
  if(!confirm('Import your LOCAL roster ('+source.players.length+' players), history ('+source.history.length+' days), and settings to '+team.name+'? This is a one-time operation. Export a JSON backup first from Local mode.'))return;
  const {data,error}=await client.rpc('save_hockey_team_data',{p_team:team.id,p_data:source,p_expected_version:version,p_section:null,p_is_import:true});
  if(error)return alert(error.message);
  version=Number(data);base=clone(source);window.hockeyCloudSetData(source,team.id);say('Imported and synced');render();
 }
 async function initializeTeam(){
  if(team?.role!=='admin'||base)return alert('Only administrators can initialize an empty team.');
  if(!confirm('Initialize '+team.name+' with a blank starter roster and default settings? This will NOT import or change your local data.'))return;
  const source=migrateData(fresh());
  const {data,error}=await client.rpc('save_hockey_team_data',{p_team:team.id,p_data:source,p_expected_version:version,p_section:null,p_is_import:true});
  if(error)return alert(error.message);
  version=Number(data);base=clone(source);window.hockeyCloudSetData(source,team.id);say('Team initialized');render();
 }
 async function invite(){
  if(team?.role!=='admin')return;
  const email=prompt('Assistant coach email:');if(!email?.trim())return;
  const {data,error}=await client.from('team_invites').insert({team_id:team.id,email:email.trim().toLowerCase(),created_by:user.id}).select('id').single();
  if(error)return alert(error.message);
  const link=location.origin+location.pathname+'?invite='+encodeURIComponent(data.id);
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(link).catch(()=>{});
  prompt('Share this invitation link with the coach (copied if permitted):',link);
 }
 async function acceptInvite(){
  if(!user)return alert('Sign in first using the email that received the invitation.');
  const id=prompt('Paste invitation link or invitation ID:');if(!id)return;
  const match=id.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);if(!match)return alert('Invalid invitation');
  const {data,error}=await client.rpc('accept_hockey_invite',{p_invite:match[0]});
  if(error)return alert(error.message);
  await listTeams();await selectTeam(data);
 }
 async function setPermission(key,value){
  if(team?.role!=='admin')return;
  const perms={...team.assistant_permissions,[key]:value};
  const {error}=await client.from('teams').update({assistant_permissions:perms}).eq('id',team.id);
  if(error)return alert(error.message);
  team.assistant_permissions=perms;render();
 }
 let calendarEvents=[],calendarError='',calendarBusy=false,calendarShowAll=false,calendarFetchedAt=0,calendarAttempted=false,calendarView='agenda',calendarMonthOffset=0;
 async function previewCalendar(){
  if(!client||!team)return alert('Select a team first.');
  calendarBusy=true;calendarAttempted=true;calendarError='';render();
  try{
   const {data,error}=await client.functions.invoke('crossbar-preview',{body:{teamId:team.id}});
   if(error)throw Error(data?.error||error.message);
   if(data?.error)throw Error(data.error);
   calendarEvents=Array.isArray(data.events)?data.events:[];calendarShowAll=false;calendarFetchedAt=Date.now();
   say('Crossbar feed loaded: '+calendarEvents.length+' events (preview only)');
  }catch(err){calendarError=String(err.message||err);say('Calendar preview unavailable')}
  calendarBusy=false;render();
 }
 function toggleCalendarAll(){calendarShowAll=!calendarShowAll;render()}

 let gameDrafts={};
 function displayCalendarDate(raw){
  const match=String(raw||'').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if(!match)return raw||'Date unavailable';
  if(!match[4])return match[1]+'-'+match[2]+'-'+match[3];
  const iso=match[1]+'-'+match[2]+'-'+match[3]+'T'+match[4]+':'+match[5]+':'+(match[6]||'00')+(match[7]?'Z':'');
  if(!match[7])return iso.replace('T',' ')+' (calendar timezone unspecified)';
  const date=new Date(iso);
  return Number.isNaN(date.valueOf())?raw:new Intl.DateTimeFormat('en-US',{timeZone:'America/Anchorage',weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date);
 }
 function titleOpponent(event){
  const title=String(event.title||'').trim(),name=String(team?.name||'').trim();
  let match=title.match(/\b(?:vs\.?|versus|v\.)\s+(.+)$/i);
  if(match)return match[1].trim();
  if(name){
   const escaped=name.replace(/[^a-zA-Z0-9 ]/g,'');
   match=title.match(new RegExp('^'+escaped+'\\s*[-–—:]\\s*(.+)$','i'));
   if(match&&!/practice/i.test(match[1]))return match[1].trim();
  }
  return '';
 }
 function candidateOpponents(event){
  const notes=String(event.notes||''),first=titleOpponent(event);
  const listed=notes.match(/(?:^|\n)\s*w\/\s*([^\n]+)/i);
  const names=[first,...(listed?listed[1].split(',').map(v=>v.trim()):[])].filter(Boolean);
  return [...new Map(names.map(n=>[n.toLowerCase(),n])).values()];
 }
 function draftFor(event){
  const key=event.uid||event.start+'|'+event.title;
  if(!gameDrafts[key]){const saved=(window.hockeyCalendarGetConfig?.().games||[]).find(x=>x.uid===key);gameDrafts[key]=saved?{opponents:[...saved.opponents],interval:saved.interval||20,rink:[...(saved.rinks||['','',''])]}:{opponents:[titleOpponent(event),'',''],interval:20,rink:['','','']};}
  return {key,draft:gameDrafts[key]};
 }
 function changeDraft(key,field,index,value){
  const draft=gameDrafts[key];if(!draft)return;
  if(field==='interval')draft.interval=Math.max(1,Math.min(120,Number(value)||20));
  else draft[field][index]=value;
  const preview=document.querySelector('[data-calendar-preview="'+encodeURIComponent(key)+'"]');
  if(preview){
   preview.innerHTML=draft.opponents.map((name,i)=>'<p>Game '+(i+1)+': '+e(name||'Opponent not selected')+' · '+(i===0?'Event start':'+'+(i*draft.interval)+' min')+(draft.rink[i]?' · '+e(draft.rink[i]):'')+'</p>').join('');
  }
  const saveButton=document.querySelector('[data-calendar-save="'+encodeURIComponent(key)+'"]');
  if(saveButton)saveButton.disabled=!permitted('settings');
 }
 function saveCalendarDraft(key){
  const event=calendarEvents.find(x=>(x.uid||x.start+'|'+x.title)===key),draft=gameDrafts[key];
  if(!event||!draft)return alert('Calendar event not found. Refresh the feed.');
  if(String(event.status||'').toUpperCase()==='CANCELLED')return alert('This event is cancelled and cannot be saved as an upcoming game day.');
  if(draft.opponents.some(x=>!x))return alert('Choose an opponent for each game, including Game 1 if the title did not identify it.');
  const start=String(event.start||'').trim();
  let iso='';
  const basic=start.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if(basic&&basic[4]){
   const local=basic[1]+'-'+basic[2]+'-'+basic[3]+'T'+basic[4]+':'+basic[5]+':'+(basic[6]||'00');
   if(basic[7])iso=local+'Z';
   else {
    const wall=Date.parse(local+'Z');
    const offsetFor=ms=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Anchorage',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));const get=t=>parts.find(p=>p.type===t).value;const represented=Date.UTC(+get('year'),+get('month')-1,+get('day'),+get('hour'),+get('minute'),+get('second'));return represented-ms};
    let instant=wall-offsetFor(wall);instant=wall-offsetFor(instant);iso=new Date(instant).toISOString();
   }
  }else if(/^\d{4}-\d{2}-\d{2}T/.test(start)){
   iso=start;
   if(!/(Z|[+-]\d{2}:?\d{2})$/i.test(iso))iso=new Date(new Date(iso+'Z').getTime()+9*3600000).toISOString();
  }
  if(!iso||!Number.isFinite(Date.parse(iso)))return alert('Could not read calendar start time: '+start);
  iso=new Date(iso).toISOString();
  if(!confirm('Save these three games to the team workspace? This updates the upcoming Game Day schedule, not generated rotations.'))return;
  const ok=window.hockeyCalendarSave({uid:key,start:iso,location:event.location||'',title:event.title||'',opponents:[...draft.opponents],rinks:[...draft.rink],interval:draft.interval});
  if(ok)say('Three-game schedule saved · see Game Day');
 }
 function calendarMonthPanel(){
  const now=new Date(),month=new Date(now.getFullYear(),now.getMonth()+calendarMonthOffset,1),first=month.getDay(),days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/Anchorage',year:'numeric',month:'2-digit',day:'2-digit'});
  const counts={};
  for(const event of calendarEvents){
   const raw=String(event.start||'');
   const m=raw.match(/^(\\d{4})(\\d{2})(\\d{2})/);
   if(m){const key=m[1]+'-'+m[2]+'-'+m[3];counts[key]=(counts[key]||0)+1}
  }
  let html='<div class="row"><button onclick="HockeyCloud.moveCalendarMonth(-1)">Previous</button><strong>'+e(month.toLocaleString('en-US',{month:'long',year:'numeric'}))+'</strong><button onclick="HockeyCloud.moveCalendarMonth(1)">Next</button></div>';
  html+='<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px">';
  for(const label of ['S','M','T','W','T','F','S'])html+='<div style="text-align:center" class="muted">'+label+'</div>';
  for(let i=0;i<first;i++)html+='<div></div>';
  for(let day=1;day<=days;day++){
   const key=month.getFullYear()+'-'+String(month.getMonth()+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'),count=counts[key]||0;
   html+='<div style="text-align:center;min-height:43px;padding:5px 1px;border-radius:7px;background:'+(count?'#e0f0f4':'#f6f8f9')+'"><strong>'+day+'</strong>'+(count?'<div style="font-size:11px;color:#087c97">'+count+' event'+(count===1?'':'s')+'</div>':'')+'</div>';
  }
  return html+'</div><p class="muted">Calendar markers show Crossbar events. Switch to Agenda to inspect and confirm games.</p>';
 }
 function setCalendarView(view){calendarView=view;render()}
 function moveCalendarMonth(delta){calendarMonthOffset+=delta;render()}
 function calendarPanel(){
  let out='<section class="card"><h2>Crossbar calendar · test preview</h2><p class="muted">Crossbar events. Select opponents and rink assignments, then save the confirmed games to Game Day.</p><button onclick="HockeyCloud.previewCalendar()" '+(calendarBusy?'disabled':'')+'>'+(calendarBusy?'Loading calendar…':'Refresh Crossbar schedule')+'</button>';
  out+='<div class="row"><button class="'+(calendarView==='agenda'?'primary':'')+'" onclick="HockeyCloud.setCalendarView(&#39;agenda&#39;)">Agenda</button><button class="'+(calendarView==='month'?'primary':'')+'" onclick="HockeyCloud.setCalendarView(&#39;month&#39;)">Month</button></div>';
  if(calendarError)out+='<p class="muted">'+e(calendarError)+'</p>';
  if(calendarView==='month')return out+calendarMonthPanel()+'</section>';
  if(calendarEvents.length){
   const relevant=calendarEvents.filter(x=>[x.title,x.notes].join(' ').toLowerCase().includes(team.name.toLowerCase()));
   const selected=calendarShowAll?calendarEvents:(relevant.length?relevant:calendarEvents);
   out+='<p class="muted">'+calendarEvents.length+' events returned · '+relevant.length+' mention '+e(team.name)+'.</p>';
   out+='<button onclick="HockeyCloud.toggleCalendarAll()">'+(calendarShowAll?'Show team matches':'Show all events')+'</button>';
   out+=selected.slice(0,35).map(event=>{
    const practice=/practice/i.test(event.title||''),opponents=candidateOpponents(event);
    const {key,draft}=draftFor(event),keyLiteral='decodeURIComponent(&#39;'+encodeURIComponent(key)+'&#39;)';
    let card='<details class="card"><summary><strong>'+e(event.title||'Untitled event')+'</strong><div class="muted">'+e(displayCalendarDate(event.start))+'</div></summary><p>Location: '+e(event.location||'Not specified')+'</p>';
    card+='<p class="muted">Status: '+e(event.status||'Not specified')+'</p>';
    card+='<strong>Original Crossbar notes</strong><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit">'+e(event.notes||'(No notes provided)')+'</pre>';
    if(practice)return card+'<p class="muted">Practice — no game slots proposed.</p></details>';
    card+='<h3>Three-game test lineup</h3><p class="muted">Possible opponents: '+e(opponents.join(', ')||'None detected')+'. Calendar notes do not establish game order.</p>';
    card+='<label>Minutes between game starts <input type="number" min="1" max="120" value="'+draft.interval+'" onchange="HockeyCloud.changeDraft('+keyLiteral+',&#39;interval&#39;,0,this.value)"></label>';
    for(let i=0;i<3;i++){
     const options=['',...opponents.filter(x=>!draft.opponents.includes(x)||x===draft.opponents[i])];if(draft.opponents[i]&&!options.includes(draft.opponents[i]))options.push(draft.opponents[i]);
     card+='<div class="row"><label>Game '+(i+1)+' opponent <select onchange="HockeyCloud.changeDraft('+keyLiteral+',&#39;opponents&#39;,'+i+',this.value)">'+options.map(v=>'<option value="'+e(v)+'" '+(draft.opponents[i]===v?'selected':'')+'>'+(v?e(v):'Select opponent')+'</option>').join('')+'</select></label>';
     card+='<label>Or type opponent <input placeholder="Team name" value="'+e(draft.opponents[i])+'" onchange="HockeyCloud.changeDraft('+keyLiteral+',&#39;opponents&#39;,'+i+',this.value)"></label>';card+='<label>Rink <input placeholder="Rink / ice section" value="'+e(draft.rink[i])+'" onchange="HockeyCloud.changeDraft('+keyLiteral+',&#39;rink&#39;,'+i+',this.value)"></label></div>';
    }
    const complete=draft.opponents.every(Boolean),alreadySaved=(window.hockeyCalendarGetConfig?.().games||[]).some(x=>x.uid===key);
    card+='<p><strong>Proposed lineup (not saved)</strong></p>';
    card+='<div data-calendar-preview="'+encodeURIComponent(key)+'">';for(let i=0;i<3;i++)card+='<p>Game '+(i+1)+': '+e(draft.opponents[i]||'Opponent not selected')+' · '+(i===0?'Event start':('+'+i*draft.interval+' min'))+(draft.rink[i]?' · '+e(draft.rink[i]):'')+'</p>';card+='</div>';
    card+='<p class="muted">'+(complete?'All three opponents selected.':'Select all three opponents to complete the preview.')+'</p><button class="primary" '+(!permitted('settings')?'disabled':'')+' onclick="HockeyCloud.saveCalendarDraft('+keyLiteral+')">'+(alreadySaved?'Update saved Game Day':'Save to team Game Day')+'</button></details>';
    return card;
   }).join('');
   if(selected.length>35)out+='<p class="muted">Showing first 35 of '+selected.length+' events.</p>';
  }
  return out+'</section>';
 }
 function nextCalendarEvent(){
  const now=Date.now();return calendarEvents.filter(x=>!(/practice/i.test(x.title||''))&&String(x.status||'').toUpperCase()!=='CANCELLED'&&[x.title,x.notes].join(' ').toLowerCase().includes(String(team?.name||'').toLowerCase())).map(x=>{const m=String(x.start||'').match(/^(\\d{4})(\\d{2})(\\d{2})T(\\d{2})(\\d{2})(\\d{2})?Z$/);return m?{...x,iso:m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':'+m[5]+':'+(m[6]||'00')+'Z'}:null}).filter(x=>x&&Date.parse(x.iso)+3600000>=now).sort((a,b)=>Date.parse(a.iso)-Date.parse(b.iso))[0]||null;
 }
 function calendarPage(){
  if(!team)return '<section class="card"><h2>Calendar</h2><p class="muted">Select a team workspace in Settings to view its Crossbar calendar.</p></section>';
  if((!calendarAttempted||calendarFetchedAt&&Date.now()-calendarFetchedAt>600000)&&!calendarBusy)queueMicrotask(()=>{if(team&&!calendarBusy)previewCalendar()});
  return calendarPanel();
 }
 function calendarSettingsPanel(){
  const config=window.hockeyCalendarGetConfig?.()||{},url=config.url||'';
  return '<section class="card"><h2>Calendar integration</h2><p class="muted">Crossbar subscription for this team. Calendar events and opponent confirmation are in the Calendar menu.</p><label>Crossbar iCalendar URL <input id="crossbar-url" type="url" value="'+e(url)+'" placeholder="https://www.accounts.crossbar.org/calendar/ical/..." '+(!permitted('settings')?'disabled':'')+'></label><div class="row"><button onclick="HockeyCloud.saveCalendarUrl()" '+(!permitted('settings')?'disabled':'')+'>Save calendar URL</button><button onclick="HockeyCloud.previewCalendar()">Test connection / refresh</button></div><p class="muted">'+(url?'Team calendar URL saved.':'Using the original Crossbar test feed until a team URL is saved.')+'</p></section>';
 }
 function saveCalendarUrl(){
  const input=document.getElementById('crossbar-url');
  if(!input)return;
  if(window.hockeyCalendarSetUrl(input.value)){calendarEvents=[];calendarAttempted=false;calendarFetchedAt=0;say('Calendar URL saved · open Calendar to refresh')}
 }
 function brandingPanel(){
  if(!team)return '';
  const b=window.hockeyBrandGet?.()||{},disabled=!permitted('settings');
  let html='<section class="card"><h2>Team branding</h2><p class="muted">Team colors and logo synchronize across coaches.</p><div class="row">';
  for(const [key,label,value] of [['brandPrimary','Header',b.primary],['brandSecondary','Buttons',b.secondary],['brandAccent','Highlights',b.accent]]){
   html+='<label>'+label+' <input type="color" value="'+e(value||'#15374d')+'" '+(disabled?'disabled':'')+' onchange="HockeyCloud.setBrandColor(&#39;'+key+'&#39;,this.value)"></label>';
  }
  html+='</div><div style="background:'+e(b.primary||'#15374d')+';color:white;padding:12px;border-radius:9px"><strong>'+e(team.name)+'</strong> <span style="background:'+e(b.secondary||'#087c97')+';padding:5px 9px;border-radius:6px">Sample button</span></div>';
  html+='<p>Team logo '+(b.logo?'<img alt="Team logo preview" src="'+e(b.logo)+'" style="width:64px;height:64px;object-fit:contain;vertical-align:middle">':'(not uploaded)')+'</p>';
  html+='<input type="file" accept="image/png,image/jpeg,image/webp" '+(disabled?'disabled':'')+' onchange="HockeyCloud.uploadBrandLogo(this.files[0])"><button '+(disabled?'disabled':'')+' onclick="HockeyCloud.resetBrand()">Reset branding</button></section>';
  return html;
 }
 function setBrandColor(key,value){window.hockeyBrandSet?.(key,value)}
 async function uploadBrandLogo(file){
  if(!file)return;if(file.size>3000000)return alert('Choose an image smaller than 3 MB.');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))return alert('Choose a PNG, JPEG or WebP image.');
  try{
   const img=new Image(),url=URL.createObjectURL(file);
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});
   URL.revokeObjectURL(url);
   const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
   const ctx=canvas.getContext('2d'),scale=Math.min(128/img.width,128/img.height),w=img.width*scale,h=img.height*scale;
   ctx.clearRect(0,0,128,128);ctx.drawImage(img,(128-w)/2,(128-h)/2,w,h);
   const encoded=canvas.toDataURL('image/webp',0.75);
   if(encoded.length>85000)return alert('Image could not be compressed enough.');
   window.hockeyBrandSet?.('brandLogo',encoded);
  }catch(err){alert('Could not read the logo image.')}
 }
 function resetBrand(){
  if(!confirm('Reset this team logo and colors?'))return;
  for(const [key,value] of [['brandPrimary','#15374d'],['brandSecondary','#087c97'],['brandAccent','#dcebf1'],['brandLogo','']])window.hockeyBrandSet?.(key,value);
 }
 function panel(){
  let html='<section class="card"><h2>Cloud & teams</h2><p id="cloud-status" class="muted">'+e(status)+'</p>';
  if(!ready)return html+'<p>Connecting to Supabase… Local features still work.</p></section>';
  if(!user)return html+'<p>Local data stays on this device until a team administrator imports it.</p><button onclick="HockeyCloud.signIn()">Send email sign-in code</button>'+(pendingEmail?'<div class="row"><button class="primary" onclick="HockeyCloud.verifyCode()">Enter verification code</button></div><p class="muted">Code sent to '+e(pendingEmail)+'</p>':'')+'</section>';
  html+='<p>Signed in: '+e(user.email)+'</p><div class="row"><button onclick="HockeyCloud.createTeam()">Create team</button><button onclick="HockeyCloud.acceptInvite()">Join via invitation</button><button onclick="HockeyCloud.signOut()">Sign out</button></div><label>Workspace <select onchange="HockeyCloud.selectTeam(this.value)"><option value="">Local only</option>'+teams.map(t=>'<option value="'+t.id+'" '+(team?.id===t.id?'selected':'')+'>'+e(t.name)+' ('+e(t.role)+')</option>').join('')+'</select></label>';
  if(team){
   html+='<h3>'+e(team.name)+'</h3><p class="muted">Role: '+e(team.role)+' · '+(base?'Cloud data loaded':'No cloud data imported yet')+'</p>';
   if(team.role==='admin'){
    if(!base)html+='<div class="row"><button class="primary" onclick="HockeyCloud.importLocal()">Import local data</button><button onclick="HockeyCloud.initializeTeam()">Initialize new team</button></div><p class="muted">Your administrator access is active. Initialize this team or import a local backup to unlock roster and app settings. Export JSON from Local only before importing.</p>';
    html+='<div class="row"><button onclick="HockeyCloud.invite()">Invite assistant coach</button></div><h3>Assistant coach permissions</h3>'+sections.map(k=>'<label class="pill"><input type="checkbox" '+(team.assistant_permissions?.[k]?'checked':'')+' onchange="HockeyCloud.setPermission(\''+k+'\',this.checked)"> '+e(k)+'</label>').join('');
   }
   if(paused)html+='<p class="muted">Sync paused. Export a backup before resolving conflicts.</p><button onclick="HockeyCloud.retry()">Retry sync</button>';
  }
  return html+'</section>'+(team?calendarSettingsPanel()+brandingPanel():'');
 }
 function canEdit(section){return !team||(!!base&&permitted(section))}
 function retry(){paused=false;drain()}
 window.addEventListener('online',()=>drain());
 return {init,onSave,canEdit,panel,calendarPage,setCalendarView,moveCalendarMonth,setBrandColor,uploadBrandLogo,resetBrand,saveCalendarUrl,previewCalendar,toggleCalendarAll,changeDraft,saveCalendarDraft,signIn,verifyCode,signOut,createTeam,selectTeam,importLocal,initializeTeam,invite,acceptInvite,setPermission,retry,get nextCalendarEvent(){return nextCalendarEvent()},get team(){return team},get pending(){return pending.length}};
})();
window.HockeyCloud=HockeyCloud;
