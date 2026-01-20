export const STORAGE_KEY = '40k_ops_state';

export function defaultState(){
  return {
    name:'',
    players:[],
    rounds:[]
  };
}

export function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : defaultState();
}

export function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
