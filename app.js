import { loadState, saveState } from './state.js';
import { nextRound } from './tournament.js';
import { renderPlayers, renderPairings, renderStandings } from './render.js';

let state = loadState();

const landing = document.getElementById('viewLanding');
const app = document.getElementById('viewApp');

function showLanding(){
  landing.hidden = false;
  app.hidden = true;
}

function showApp(){
  landing.hidden = true;
  app.hidden = false;
  document.getElementById('eventTitle').textContent = state.name;
  refresh();
}

function refresh(){
  renderPlayers(state);
  renderPairings(state);
  renderStandings(state);
  saveState(state);
}

document.getElementById('btnRecommend').onclick = ()=>{
  state.name = document.getElementById('lEventName').value || '40K Event';
  showApp();
};

document.getElementById('btnCustomBuild').onclick = ()=>{
  state.name = 'Custom 40K Event';
  showApp();
};

document.getElementById('btnAddPlayer').onclick = ()=>{
  const n = newPlayerName.value.trim();
  if(!n) return;
  state.players.push({ name:n, faction:newPlayerFaction.value });
  newPlayerName.value='';
  newPlayerFaction.value='';
  refresh();
};

document.getElementById('btnNextRound').onclick = ()=>{
  nextRound(state);
  refresh();
};

document.querySelectorAll('.tab').forEach(btn=>{
  btn.onclick = ()=>{
    document.querySelectorAll('.tab,.tabBody').forEach(e=>e.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
  };
});

showLanding();
