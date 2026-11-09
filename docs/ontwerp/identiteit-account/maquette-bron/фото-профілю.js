// Єдине джерело світлини для всіх зображень власника в макеті.
// На справжньому сайті цей об'єкт заповнює лише авторизований застосунок із user.picture.
// Окремий макет не звертається до облікового запису й не завантажує вибраних файлів на сервер.
const даніВласника=window.MIJN_RUIMTE_PROFIEL;
const дозволенаСвітлина=(значення)=>{
  if(typeof значення!=="string"||!значення.trim())return "";
  // У чинному застосунку власне фото може бути збережене як зображення всередині даних акаунта.
  if(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(значення)&&значення.length<=340000)return значення;
  try{
    const адреса=new URL(значення,location.href);
    const вузол=адреса.hostname.toLowerCase();
    return адреса.protocol==="https:"&&(вузол==="lh3.googleusercontent.com"||вузол.endsWith(".googleusercontent.com"))?адреса.href:"";
  }catch{return "";}
};
const світлинаПрофілю={
  імʼя:даніВласника?.bevestigd===true&&typeof даніВласника.naam==="string"?даніВласника.naam.trim():"",
  адреса:даніВласника?.bevestigd===true?дозволенаСвітлина(даніВласника.foto):"",
  джерело:даніВласника?.bevestigd===true?"акаунт":"немає",
  місцеваАдреса:""
};

// Під час переходу між обліковими записами застосунок має передавати новий стан.
// Джерело оновлення — лише власний код авторизованої сторінки, не повідомлення з інших сайтів.
function прийнятиФотоПрофілю(новийПрофіль){
  if(світлинаПрофілю.місцеваАдреса)URL.revokeObjectURL(світлинаПрофілю.місцеваАдреса);
  світлинаПрофілю.місцеваАдреса="";
  світлинаПрофілю.імʼя=новийПрофіль?.bevestigd===true&&typeof новийПрофіль.naam==="string"?новийПрофіль.naam.trim():"";
  світлинаПрофілю.адреса=новийПрофіль?.bevestigd===true?дозволенаСвітлина(новийПрофіль.foto):"";
  світлинаПрофілю.джерело=новийПрофіль?.bevestigd===true?"акаунт":"немає";
  оновитиФотоПрофілю();
}
window.addEventListener("mijn-ruimte:profiel-bijgewerkt",подія=>прийнятиФотоПрофілю(подія.detail));

const позначкаВідсутньогоФото='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8.1" r="3.3"/><path d="M5.6 20a6.4 6.4 0 0 1 12.8 0"/></svg>';
const моваПрофілю=()=>typeof preferences!=="undefined"?preferences.lang:document.documentElement.lang;
const перекладПрофілю=(ук,нл)=>моваПрофілю()==="nl"?нл:ук;
function naamVoorProfiel(){return світлинаПрофілю.імʼя||перекладПрофілю("Ваш профіль","Jouw profiel");}
function оновитиФотоПрофілю(){
  document.querySelectorAll("[data-profile-photo]").forEach(місце=>{
    місце.classList.toggle("profile-has-photo",Boolean(світлинаПрофілю.адреса));
    місце.classList.toggle("profile-photo-empty",!світлинаПрофілю.адреса);
    місце.replaceChildren();
    if(світлинаПрофілю.адреса){
      const зображення=document.createElement("img");
      зображення.src=світлинаПрофілю.адреса;
      зображення.alt="";
      зображення.referrerPolicy="no-referrer";
      зображення.decoding="async";
      зображення.addEventListener("error",()=>{
        if(світлинаПрофілю.адреса===зображення.src){
          світлинаПрофілю.адреса="";
          світлинаПрофілю.джерело="недоступне";
          оновитиФотоПрофілю();
        }
      },{once:true});
      місце.append(зображення);
    }else місце.innerHTML=позначкаВідсутньогоФото;
    if(!місце.hasAttribute("aria-hidden")&&місце.tagName!=="BUTTON")місце.setAttribute("aria-label",світлинаПрофілю.адреса?перекладПрофілю("Світлина власника","Foto van de eigenaar"):перекладПрофілю("Світлину не підключено","Geen foto verbonden"));
  });
  document.querySelectorAll("[data-profile-name]").forEach(місце=>місце.textContent=naamVoorProfiel());
  const рядок=document.getElementById("profilePhotoStatus"),пояснення=document.getElementById("profilePhotoExplanation");
  if(!рядок||!пояснення)return;
  const мова=моваПрофілю();
  const написи={
    акаунт:["Світлина отримана з облікового запису","Foto ontvangen uit het account","Зображення надане авторизованим застосунком. У цьому макеті його можна лише переглядати.","De aangemelde toepassing heeft de foto aangeleverd. Dit ontwerp toont haar alleen."],
    попередній:["Місцева світлина лише для перегляду","Lokale foto alleen als voorbeeld","Файл залишається у вашому браузері. Він не надсилається на сервер і не змінює фото облікового запису. Після оновлення сторінки місцевий перегляд зникне.","Het bestand blijft in je browser. Het wordt niet verstuurd en wijzigt je accountfoto niet. Na het vernieuwen verdwijnt dit voorbeeld."],
    немає:["Дані облікового запису ще не підключено","Accountgegevens zijn nog niet verbonden","Коли нове оформлення працюватиме всередині Mijn Ruimte, воно отримає справжню світлину з облікового запису. Зараз можна тимчасово обрати власний файл.","Binnen Mijn Ruimte krijgt dit ontwerp de echte accountfoto. Nu kun je tijdelijk een eigen bestand kiezen."],
    недоступне:["Світлину облікового запису не вдалося відобразити","De accountfoto kon niet worden getoond","Джерело світлини не відкривається. Замість вигаданого зображення показано нейтральну позначку.","De fotobron is niet bereikbaar. In plaats van een verzonnen foto zie je een neutraal symbool."]
  };
  const текст=написи[світлинаПрофілю.джерело]||написи.немає;
  рядок.textContent=текст[мова==="nl"?1:0];
  пояснення.textContent=текст[мова==="nl"?3:2];
  document.getElementById("profilePhotoEyebrow").textContent=перекладПрофілю("ОБЛІКОВИЙ ЗАПИС","ACCOUNT");
  document.getElementById("profilePhotoTitle").textContent=перекладПрофілю("Справжня світлина профілю","Echte profielfoto");
  document.getElementById("profilePhotoPickLabel").textContent=перекладПрофілю("Обрати свою світлину для макета","Eigen foto voor het ontwerp kiezen");
  document.querySelector("[data-close-profile-photo]")?.setAttribute("aria-label",перекладПрофілю("Закрити","Sluiten"));
}

document.addEventListener("click",подія=>{
  const діалог=document.getElementById("profilePhotoDialog");
  if(подія.target.closest("[data-open-profile-photo]")){
    оновитиФотоПрофілю();
    if(!діалог.open)діалог.showModal();
  }
  if(подія.target.closest("[data-close-profile-photo]")||подія.target===діалог)діалог.close();
});
document.getElementById("profilePhotoFile").addEventListener("change",подія=>{
  const файл=подія.target.files?.[0];
  if(!файл)return;
  const повідомлення=document.getElementById("profilePhotoWarning");
  if(!/^image\/(jpeg|png|webp)$/.test(файл.type)||файл.size>8*1024*1024){
    повідомлення.textContent=перекладПрофілю("Оберіть JPEG, PNG або WebP розміром до 8 МБ.","Kies JPEG, PNG of WebP tot 8 MB.");
    подія.target.value="";
    return;
  }
  if(світлинаПрофілю.місцеваАдреса)URL.revokeObjectURL(світлинаПрофілю.місцеваАдреса);
  світлинаПрофілю.місцеваАдреса=URL.createObjectURL(файл);
  світлинаПрофілю.адреса=світлинаПрофілю.місцеваАдреса;
  світлинаПрофілю.джерело="попередній";
  повідомлення.textContent=перекладПрофілю("Відображено лише в макеті. Справжнє фото акаунта не змінено.","Alleen in het ontwerp getoond. De echte accountfoto blijft ongewijzigd.");
  оновитиФотоПрофілю();
  подія.target.value="";
});
window.addEventListener("pagehide",()=>{if(світлинаПрофілю.місцеваАдреса)URL.revokeObjectURL(світлинаПрофілю.місцеваАдреса);});
