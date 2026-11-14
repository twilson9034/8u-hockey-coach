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
   say(user?'Signed in · select a team':'Local only · sign in to sync');
  }catch(err){say('Cloud unavailable · local mode works offline')}
 }
 async function signIn(){
  if(!client)return alert('Cloud is still loading. Try again when online.');
  const email=prompt('Email address for your sign-in link:');if(!email)return;
  const {error}=await client.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:location.origin+location.pathname}});
  alert(error?'Sign-in error: '+error.message:'Check your email for a sign-in link. Open it on this device.');
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
  team=selected;localStorage.setItem('hockey-coach-last-team',id);version=Number(data.version);pending=[];paused=false;
  if(data.imported_at){
   base=clone(data.data);window.hockeyCloudSetData(data.data,id);say('Synced');
  }else{base=null;window.hockeyCloudSetData(null,id);say('Team awaits administrator import')}
  if(channel)await client.removeChannel(channel);
  channel=client.channel('hockey-team-'+id).on('postgres_changes',{event:'UPDATE',schema:'public',table:'team_data',filter:'team_id=eq.'+id},()=>refresh()).subscribe();
  render();
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
  if(!raw)return alert('No existing local data to import.');
  let source;try{source=migrateData(JSON.parse(raw))}catch(err){return alert('Local data is invalid: '+err.message)}
  if(!confirm('Import your LOCAL roster ('+source.players.length+' players), history ('+source.history.length+' days), and settings to '+team.name+'? This is a one-time operation. Export a JSON backup first from Local mode.'))return;
  const {data,error}=await client.rpc('save_hockey_team_data',{p_team:team.id,p_data:source,p_expected_version:version,p_section:null,p_is_import:true});
  if(error)return alert(error.message);
  version=Number(data);base=clone(source);window.hockeyCloudSetData(source,team.id);say('Imported and synced');render();
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
 function panel(){
  let html='<section class="card"><h2>Cloud & teams</h2><p id="cloud-status" class="muted">'+e(status)+'</p>';
  if(!ready)return html+'<p>Connecting to Supabase… Local features still work.</p></section>';
  if(!user)return html+'<p>Local data stays on this device until a team administrator imports it.</p><button onclick="HockeyCloud.signIn()">Sign in with email</button></section>';
  html+='<p>Signed in: '+e(user.email)+'</p><div class="row"><button onclick="HockeyCloud.createTeam()">Create team</button><button onclick="HockeyCloud.acceptInvite()">Join via invitation</button><button onclick="HockeyCloud.signOut()">Sign out</button></div><label>Workspace <select onchange="HockeyCloud.selectTeam(this.value)"><option value="">Local only</option>'+teams.map(t=>'<option value="'+t.id+'" '+(team?.id===t.id?'selected':'')+'>'+e(t.name)+' ('+e(t.role)+')</option>').join('')+'</select></label>';
  if(team){
   html+='<h3>'+e(team.name)+'</h3><p class="muted">Role: '+e(team.role)+' · '+(base?'Cloud data loaded':'No cloud data imported yet')+'</p>';
   if(team.role==='admin'){
    if(!base)html+='<button class="primary" onclick="HockeyCloud.importLocal()">Import local data to this team</button><p class="muted">Switch to Local only and export JSON from History before importing.</p>';
    html+='<div class="row"><button onclick="HockeyCloud.invite()">Invite assistant coach</button></div><h3>Assistant coach permissions</h3>'+sections.map(k=>'<label class="pill"><input type="checkbox" '+(team.assistant_permissions?.[k]?'checked':'')+' onchange="HockeyCloud.setPermission(\''+k+'\',this.checked)"> '+e(k)+'</label>').join('');
   }
   if(paused)html+='<p class="muted">Sync paused. Export a backup before resolving conflicts.</p><button onclick="HockeyCloud.retry()">Retry sync</button>';
  }
  return html+'</section>';
 }
 function canEdit(section){return !team||(!!base&&permitted(section))}
 function retry(){paused=false;drain()}
 window.addEventListener('online',()=>drain());
 return {init,onSave,canEdit,panel,signIn,signOut,createTeam,selectTeam,importLocal,invite,acceptInvite,setPermission,retry,get team(){return team},get pending(){return pending.length}};
})();
window.HockeyCloud=HockeyCloud;
