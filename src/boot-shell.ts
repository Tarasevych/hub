let releaseRequested=false;
export const releaseBootShell=()=>{if(releaseRequested)return;releaseRequested=true;const root=document.documentElement;const boot=document.getElementById('boot-shell');requestAnimationFrame(()=>{root.classList.remove('boot-active');if(boot){boot.hidden=true;boot.remove()}})};
