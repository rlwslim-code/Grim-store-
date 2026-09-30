const MARKETS={NG:{name:'Nigeria',currency:'NGN',locale:'en-NG',rate:1},US:{name:'United States',currency:'USD',locale:'en-US',rate:0.00067},GB:{name:'United Kingdom',currency:'GBP',locale:'en-GB',rate:0.00050},CA:{name:'Canada',currency:'CAD',locale:'en-CA',rate:0.00091},AU:{name:'Australia',currency:'AUD',locale:'en-AU',rate:0.00102},DE:{name:'Germany',currency:'EUR',locale:'de-DE',rate:0.00057},FR:{name:'France',currency:'EUR',locale:'fr-FR',rate:0.00057},IT:{name:'Italy',currency:'EUR',locale:'it-IT',rate:0.00057},ES:{name:'Spain',currency:'EUR',locale:'es-ES',rate:0.00057},NL:{name:'Netherlands',currency:'EUR',locale:'nl-NL',rate:0.00057},GH:{name:'Ghana',currency:'GHS',locale:'en-GH',rate:0.0073},ZA:{name:'South Africa',currency:'ZAR',locale:'en-ZA',rate:0.0114},KE:{name:'Kenya',currency:'KES',locale:'en-KE',rate:0.086},AE:{name:'United Arab Emirates',currency:'AED',locale:'en-AE',rate:0.00246},JP:{name:'Japan',currency:'JPY',locale:'ja-JP',rate:0.100}};
const CURRENCY_RATES={NGN:1,USD:.00067,GBP:.00050,EUR:.00057,CAD:.00091,AUD:.00102,GHS:.0073,ZAR:.0114,KES:.086,AED:.00246,JPY:.100};
let market=JSON.parse(localStorage.getItem('grimMarket')||'null')||{country:'NG',currency:'NGN'};
function money(n){let c=market.currency||'NGN',v=Number(n)*(CURRENCY_RATES[c]||1),loc=(MARKETS[market.country]||MARKETS.NG).locale;return new Intl.NumberFormat(loc,{style:'currency',currency:c,maximumFractionDigits:c==='JPY'?0:2}).format(v)}
function openMarket(){fillMarket();E('marketModal')?.classList.add('open')}function closeMarket(){E('marketModal')?.classList.remove('open')}
function fillMarket(){let c=E('marketCountry'),u=E('marketCurrency');if(!c||!u)return;c.innerHTML=Object.entries(MARKETS).map(([k,v])=>`<option value="${k}">${v.name}</option>`).join('');u.innerHTML=Object.keys(CURRENCY_RATES).map(k=>`<option>${k}</option>`).join('');c.value=market.country;u.value=market.currency;c.onchange=()=>{u.value=MARKETS[c.value].currency}}
function saveMarket(){market={country:E('marketCountry').value,currency:E('marketCurrency').value};localStorage.setItem('grimMarket',JSON.stringify(market));updateMarketUI();render();draw();closeMarket()}
function updateMarketUI(){let x=MARKETS[market.country]||MARKETS.NG;if(E('marketLabel'))E('marketLabel').textContent=`${x.name} · ${market.currency}`}
async function detectMarket(){if(localStorage.getItem('grimMarket')){updateMarketUI();return}try{let r=await fetch('/api/market'),j=await r.json();if(j.country&&MARKETS[j.country])market={country:j.country,currency:MARKETS[j.country].currency};localStorage.setItem('grimMarket',JSON.stringify(market))}catch(e){}updateMarketUI()}

const FALLBACK_CATALOG=[{"id":1,"name":"Rose Reaper","type":"Hoodie","price":28000,"color":"Pink"},{"id":2,"name":"Veil","type":"Hoodie","price":28000,"color":"White"},{"id":3,"name":"Abyss","type":"Hoodie","price":28000,"color":"Blue"},{"id":4,"name":"Eclipse Gold","type":"Hoodie","price":28000,"color":"Yellow"},{"id":5,"name":"Rose Reaper","type":"Hoodie","price":28000,"color":"Pink"},{"id":6,"name":"Eclipse Gold","type":"Armless","price":15000,"color":"Yellow"},{"id":7,"name":"Bloodline","type":"Hoodie","price":28000,"color":"Red"},{"id":8,"name":"Obsidian","type":"Armless","price":15000,"color":"Black"},{"id":10,"name":"Obsidian / Veil","type":"Tee","price":18000,"color":"Mixed"},{"id":11,"name":"Veil / Abyss","type":"Hoodie","price":28000,"color":"Mixed"},{"id":12,"name":"Veil","type":"Tee","price":18000,"color":"White"},{"id":13,"name":"Veil / Abyss / Obsidian","type":"Armless","price":15000,"color":"Mixed"},{"id":14,"name":"Void Violet","type":"Hoodie","price":28000,"color":"Purple"},{"id":15,"name":"Veil / Obsidian","type":"Hoodie","price":28000,"color":"Mixed"},{"id":16,"name":"Obsidian / Veil","type":"Hoodie","price":28000,"color":"Mixed"},{"id":17,"name":"Rose Reaper","type":"Hoodie","price":28000,"color":"Pink"},{"id":18,"name":"Obsidian","type":"Hoodie","price":28000,"color":"Black"},{"id":19,"name":"Abyss","type":"Hoodie","price":28000,"color":"Blue"},{"id":20,"name":"Void Violet","type":"Hoodie","price":28000,"color":"Purple"},{"id":21,"name":"Rose Reaper","type":"Tee","price":18000,"color":"Pink"},{"id":22,"name":"Veil","type":"Hoodie","price":28000,"color":"White"},{"id":23,"name":"Obsidian","type":"Tee","price":18000,"color":"Black"},{"id":24,"name":"Veil / Obsidian","type":"Complete GRIM Outfit","price":90000,"color":"Mixed"},{"id":25,"name":"Obsidian","type":"Hoodie","price":28000,"color":"Black"},{"id":26,"name":"Rose Reaper","type":"Hoodie","price":28000,"color":"Pink"}];
let catalog=FALLBACK_CATALOG.slice(),mode='login',shopPage=1;
const E=id=>document.getElementById(id),M=n=>money(n);
const storedCart=JSON.parse(localStorage.getItem('grimCart')||'[]');
let cart=storedCart.map(x=>{const p=catalog.find(v=>v.id==x.id);return p?{...p,size:x.size||'M',qty:Math.max(1,+x.qty||1)}:null}).filter(Boolean);
function save(){localStorage.setItem('grimCart',JSON.stringify(cart))}
function productVisual(p){return p.image||(window.GRIM_DESIGNS||[])[p.id-1]||'/assets/grim-wordmark.png'}
function render(){const root=E('products');if(!root)return;let q=(E('search')?.value||'').toLowerCase(),cat=E('category')?.value||'all',col=E('color')?.value||'all',sort=E('sort')?.value||'featured';let list=catalog.filter(p=>(!q||`${p.name} ${p.color} ${p.type} ravkael`.toLowerCase().includes(q))&&(cat==='all'||p.type===cat)&&(col==='all'||p.color===col));if(sort==='low')list.sort((a,b)=>a.price-b.price);if(sort==='high')list.sort((a,b)=>b.price-a.price);const per=8,pages=Math.max(1,Math.ceil(list.length/per));shopPage=Math.min(shopPage,pages);let shown=list.slice((shopPage-1)*per,shopPage*per);E('resultCount').textContent=`${list.length} PIECES · PAGE ${shopPage} OF ${pages}`;root.innerHTML=shown.map(p=>`<article class="card"><div class="pic"><img src="${productVisual(p)}" loading="lazy" alt="${p.name} ${p.type}"><span class="type-pill">${p.type}</span></div><div class="info"><p class="colorway">${p.color} · RAV’KAEL</p><div class="info-row"><h3>${p.name}</h3><b>${M(p.price)}</b></div><small class="product-type">${p.type}</small><label class="size-label">SIZE <select id="size-${p.id}"><option>S</option><option selected>M</option><option>L</option><option>XL</option><option>XXL</option></select></label><button onclick="add(${p.id})">ADD TO CART 🛒</button></div></article>`).join('')||'<p class="empty-note">No pieces match your filters.</p>';let pg=E('pagination');if(pg)pg.innerHTML=pages>1?`<button ${shopPage===1?'disabled':''} onclick="shopPage--;render();scrollToShop()">← PREVIOUS</button><span>${shopPage} / ${pages}</span><button ${shopPage===pages?'disabled':''} onclick="shopPage++;render();scrollToShop()">NEXT →</button>`:''}
async function init(){
  await detectMarket();
  catalog=FALLBACK_CATALOG.slice();
  try{const r=await fetch('/api/products',{cache:'no-store'});if(r.ok){const live=await r.json();if(Array.isArray(live)&&live.length)catalog=live}}catch(e){}
  cart=cart.map(x=>{const p=catalog.find(v=>v.id==x.id);return p?{...p,size:x.size||'M',qty:Math.max(1,+x.qty||1)}:null}).filter(Boolean);save();
  const colorSelect=E('color');
  if(colorSelect){
    const colors=[...new Set(catalog.map(p=>p.color))];
    colorSelect.innerHTML='<option value="all">All colorways</option>'+colors.map(c=>`<option value="${c}">${c}</option>`).join('');
  }
  render();
  ['search','category','color','sort'].forEach(id=>E(id)?.addEventListener(id==='search'?'input':'change',()=>{shopPage=1;render()}));
  try{let u=await fetch('/api/me').then(r=>r.json());if(u&&E('acct'))E('acct').textContent=u.name.toUpperCase()}catch(e){}
  draw();
}
function add(id){let p=catalog.find(v=>v.id==id);if(!p)return;let size=E('size-'+id)?.value||'M',x=cart.find(v=>v.id==id&&v.size===size);x?x.qty++:cart.push({...p,size,qty:1});save();draw();openBag()}
function qty(i,d){cart[i].qty+=d;if(cart[i].qty<1)cart.splice(i,1);save();draw()}
function removeItem(i){cart.splice(i,1);save();draw()}
function draw(){if(E('count'))E('count').textContent=cart.reduce((a,x)=>a+x.qty,0);if(E('items'))E('items').innerHTML=cart.map((x,i)=>`<div class="cart-line"><img src="${productVisual(x)}"><div><b>${x.name}</b><small>${x.color} · ${x.size}</small><div class="qty"><button onclick="qty(${i},-1)">−</button><span>${x.qty}</span><button onclick="qty(${i},1)">+</button><button class="remove" onclick="removeItem(${i})">REMOVE</button></div></div><strong>${M(x.price*x.qty)}</strong></div>`).join('')||'<p>Your bag is empty.</p>';if(E('total'))E('total').textContent=M(cart.reduce((a,x)=>a+x.price*x.qty,0))}
function openBag(){E('bag')?.classList.add('open')}function closeBag(){E('bag')?.classList.remove('open')}function openAuth(){E('auth')?.classList.add('open')}function closeAuth(){E('auth')?.classList.remove('open')}function setMode(x){mode=x;let n=E('aName');if(n){n.style.display=x==='register'?'block':'none';n.required=x==='register'}if(E('aMsg'))E('aMsg').textContent=''}function openCheckout(){if(!cart.length)return;closeBag();E('checkout')?.classList.add('open')}function closeCheckout(){E('checkout')?.classList.remove('open')}
if(E('authForm'))E('authForm').onsubmit=async e=>{e.preventDefault();let r=await fetch('/api/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:E('aName').value,email:E('aEmail').value,password:E('aPass').value})}),j=await r.json();E('aMsg').textContent=r.ok?'WELCOME TO THE HOUSE.':j.error;if(r.ok){E('acct').textContent=j.name.toUpperCase();setTimeout(closeAuth,600)}};
if(E('orderForm'))E('orderForm').onsubmit=async e=>{e.preventDefault();let r=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:E('oName').value,email:E('oEmail').value,phone:E('oPhone').value,address:E('oAddress').value,country:market.country,currency:market.currency,items:cart.map(x=>({id:x.id,qty:x.qty,size:x.size}))})}),j=await r.json();if(r.ok){E('oMsg').textContent=`ORDER #${j.orderId} RECEIVED — ${M(j.total)}`;cart=[];save();draw();E('orderForm').reset()}else E('oMsg').textContent=j.error};setMode('login');init();

function toggleMobile(){E('mobileNav')?.classList.toggle('open')}
function openSearch(){E('search')?.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>E('search')?.focus(),500)}
function quickSearch(q){let s=E('search');if(s){s.value=q;render();s.scrollIntoView({behavior:'smooth',block:'center'})}}
function clearFilters(){if(E('search'))E('search').value='';if(E('category'))E('category').value='all';if(E('color'))E('color').value='all';if(E('sort'))E('sort').value='featured';render()}
function openHelp(kind='general'){let map={order:'ORDER SUPPORT',size:'SIZE HELP',delivery:'DELIVERY SUPPORT',general:'CONTACT GRIM'};if(E('helpTitle'))E('helpTitle').textContent=map[kind]||map.general;if(E('helpTopic'))E('helpTopic').value=kind==='order'?'Order support':kind==='size'?'Size help':kind==='delivery'?'Delivery':'Other';E('helpModal')?.classList.add('open')}
function closeHelp(){E('helpModal')?.classList.remove('open')}
if(E('helpForm'))E('helpForm').onsubmit=async e=>{e.preventDefault();let r=await fetch('/api/support',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic:E('helpTopic').value,name:E('hName').value,email:E('hEmail').value,order:E('hOrder').value,message:E('hMessage').value})}),j=await r.json();E('hMsg').textContent=r.ok?`MESSAGE RECEIVED — SUPPORT #${j.ticketId}`:(j.error||'Please try again.');if(r.ok)E('helpForm').reset()};
if(E('newsForm'))E('newsForm').onsubmit=async e=>{e.preventDefault();let r=await fetch('/api/newsletter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:E('newsEmail').value})}),j=await r.json();E('newsMsg').textContent=r.ok?'WELCOME TO THE HOUSE.':(j.error||'Please try again.');if(r.ok)E('newsForm').reset()};

function scrollToShop(){document.querySelector('.shop')?.scrollIntoView({behavior:'smooth',block:'start'})}// ===== GRIM CHECKOUT V2 =====
function buildGrimCheckout(){
  const box=document.querySelector('#checkout .checkout-box');
  if(!box)return;

  box.innerHTML=`
    <button class="x" onclick="closeCheckout()">×</button>
    <span class="eyebrow">SECURE CHECKOUT</span>
    <h2>CHECKOUT</h2>

    <div style="display:flex;gap:8px;margin:15px 0 25px;font-size:12px">
      <b>1 BAG</b> → <b>2 DELIVERY</b> → <b>3 PAYMENT</b>
    </div>

    <form id="grimCheckoutForm">

      <h3>CONTACT</h3>
      <input id="coEmail" type="email" required placeholder="Email address">
      <input id="coPhone" type="tel" required placeholder="Phone number">

      <h3>DELIVERY ADDRESS</h3>

      <select id="coCountry" required>
        <option value="NG">Nigeria</option>
        <option value="US">United States</option>
        <option value="GB">United Kingdom</option>
        <option value="CA">Canada</option>
        <option value="GH">Ghana</option>
        <option value="ZA">South Africa</option>
        <option value="KE">Kenya</option>
        <option value="AE">United Arab Emirates</option>
      </select>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <input id="coFirst" required placeholder="First name">
        <input id="coLast" required placeholder="Last name">
      </div>

      <input id="coAddress" required placeholder="Street address">
      <input id="coApartment" placeholder="Apartment, suite, etc. (optional)">

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <input id="coCity" required placeholder="City">
        <input id="coState" required placeholder="State / Province">
      </div>

      <input id="coPostal" placeholder="Postal / ZIP code">
      <textarea id="coInstructions"
        placeholder="Delivery instructions (optional)"></textarea>

      <h3>DELIVERY METHOD</h3>

      <label style="display:block;border:1px solid #bbb;padding:16px;margin:10px 0">
        <input type="radio" name="delivery" value="standard" checked>
        <b> Standard Delivery</b><br>
        <small>Delivery cost will be calculated for your destination.</small>
      </label>

      <button class="dark full" type="submit">
        CONTINUE TO PAYMENT
      </button>

      <p id="checkoutMessage"></p>
    </form>

    <div id="paymentStep" style="display:none">
      <h3>PAYMENT</h3>
      <p class="muted">Choose how you would like to pay.</p>

      <button class="dark full" id="payCard" type="button">
        💳 PAY WITH CARD
      </button>

      <button class="dark full" id="payTransfer"
        type="button" style="margin-top:12px">
        🏦 PAY BY BANK TRANSFER
      </button>

      <button type="button" id="backDelivery"
        style="margin-top:18px">
        ← BACK TO DELIVERY
      </button>

      <p id="paymentMessage"></p>
    </div>
  `;

  const country=E('coCountry');
  if(market?.country && [...country.options].some(o=>o.value===market.country)){
    country.value=market.country;
  }

  function paymentAvailability(){
    const transfer=E('payTransfer');
    if(transfer){
      transfer.style.display=
        country.value==='NG' ? 'block' : 'none';
    }
  }

  paymentAvailability();
  country.addEventListener('change',paymentAvailability);

  E('grimCheckoutForm').onsubmit=e=>{
    e.preventDefault();

    E('grimCheckoutForm').style.display='none';
    E('paymentStep').style.display='block';

    paymentAvailability();

    box.scrollTop=0;
  };

  E('backDelivery').onclick=()=>{
    E('paymentStep').style.display='none';
    E('grimCheckoutForm').style.display='block';
  };

  E('payCard').onclick=()=>{
    E('paymentMessage').textContent=
      'Preparing secure card payment…';
    startGrimPayment('card');
  };

  E('payTransfer').onclick=()=>{
    E('paymentMessage').textContent=
      'Preparing secure bank transfer…';
    startGrimPayment('bank_transfer');
  };
}

function startGrimPayment(method){
  window.grimPendingPayment={
    method,
    email:E('coEmail').value,
    phone:E('coPhone').value,
    name:`${E('coFirst').value} ${E('coLast').value}`,
    address:[
      E('coAddress').value,
      E('coApartment').value,
      E('coCity').value,
      E('coState').value,
      E('coPostal').value
    ].filter(Boolean).join(', '),
    country:E('coCountry').value,
    items:cart,
    total:cart.reduce((sum,item)=>sum+(item.price*item.qty),0)
  };

  E('paymentMessage').textContent=
    'Payment gateway connection is the next setup step.';
}

buildGrimCheckout();
