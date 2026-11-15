(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.ELSN_NPC_DIALOGUE_CORE=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const MAX_VISIBLE_BUBBLES=4,MAX_RANGE_METERS=26,POSITION_UPDATE_MS=100,SCHEDULER_INTERVAL_MS=1200;
const ROLES=Object.freeze([
 Object.freeze({id:"fisher",name:"Pescador",thoughts:["La marea está cambiando; habrá que revisar las redes.","El mar siempre encuentra la forma de sorprendernos."],speech:["Hoy las redes pesan poco.","Cuando cambie el viento, saldré a pescar.","Necesitamos más cuerda para las redes."]}),
 Object.freeze({id:"farmer",name:"Campesino",thoughts:["La tierra necesita cuidados antes de la próxima cosecha.","No podemos desperdiciar ni una sola provisión."],speech:["Hoy toca revisar los cultivos.","La cosecha saldrá adelante si cuidamos la tierra.","Las provisiones deben durar hasta la próxima estación."]}),
 Object.freeze({id:"smith",name:"Herrero",thoughts:["Una buena hoja necesita paciencia y buen fuego.","El hierro de esta isla exige un trabajo cuidadoso."],speech:["La fragua necesita más carbón.","Me vendría bien recibir más mineral.","Cada herramienta debe aguantar muchos inviernos."]}),
 Object.freeze({id:"trader",name:"Mercader",thoughts:["Los rumores viajan más rápido que los barcos.","Conviene guardar algo para los días difíciles."],speech:["Siempre hay algo que intercambiar en otra isla.","Ojalá llegue pronto un barco mercante.","Una ruta segura puede traer noticias y provisiones."]})
]);
const OPENERS=["¿Has oído algo nuevo de la costa?","¿Cómo marcha el trabajo hoy?","¿Crees que tendremos una travesía tranquila?","¿Has visto al resto del poblado esta mañana?"];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
function rand(r){const n=typeof r==="function"?Number(r()):Math.random();return Number.isFinite(n)?Math.max(0,Math.min(.999999,n)):.5;}
function choose(a,r){return a[Math.floor(rand(r)*a.length)];}
function roleForVariant(v){return ROLES[Math.abs(Math.floor(Number(v)||0))%ROLES.length];}
function suppliesContext(ctx){return Number.isFinite(Number(ctx.wood))||Number.isFinite(Number(ctx.stone));}
function contextualLines(role,ctx){
 const lines=[];
 if(ctx.enemyNearby===true)lines.push({topic:"danger",kind:"speech",text:role.id==="fisher"?"¡Hay saqueadores cerca! No te quedes junto a la costa.":"¡He visto enemigos cerca del poblado! Mantén el arma preparada."});
 if(ctx.healthLow===true)lines.push({topic:"health",kind:"speech",text:"Estás herido. Busca un lugar seguro y recupera fuerzas antes de volver a luchar."});
 if(ctx.night===true)lines.push({topic:"night",kind:"speech",text:role.id==="farmer"?"Está anocheciendo. Será mejor asegurar el poblado y no alejarse de la luz.":role.id==="fisher"?"Con esta oscuridad no saldría a navegar sin revisar antes la costa.":"La noche cubre los caminos. Vigila los alrededores y mantente cerca del fuego."});
 if(ctx.onShip===true)lines.push({topic:"voyage",kind:"speech",text:role.id==="fisher"?"Vigila el viento y los bajíos. Una mala maniobra puede abrir el casco.":role.id==="trader"?"Cada isla puede guardar provisiones, pero primero hay que encontrar un desembarco seguro.":"No pierdas de vista la costa; desde el barco los arrecifes engañan."});
 if(suppliesContext(ctx)&&Number(ctx.wood)<=5)lines.push({topic:"wood",kind:"speech",text:role.id==="smith"?"Nos queda poca madera para reparar herramientas y defensas.":"Las reservas de madera son escasas. Conviene talar cerca del campamento."});
 if(suppliesContext(ctx)&&Number(ctx.stone)<=5)lines.push({topic:"stone",kind:"speech",text:role.id==="smith"?"Nos falta piedra para reforzar el equipo. Busca un afloramiento de granito y usa el pico.":"Queda poca piedra. Los bloques de granito de la isla pueden servirnos."});
 if(ctx.playerClose===true)lines.push({topic:"greeting",kind:"speech",text:role.id==="trader"?"¡Eh, viajero! ¿Traes noticias de otras islas?":role.id==="fisher"?"¡Buen día! ¿Has visto cómo está el mar?":"Me alegra verte. ¿Cómo marcha la expedición?"});
 if(ctx.recentCapture===true)lines.push({topic:"victory",kind:"speech",text:"La bandera vuelve a ondear sobre una aldea libre. No olvidaremos a quienes lucharon por ella."});
 return lines;
}
function chooseAmbientMessage(npc,context,random,memory){
 const p=npc&&npc.parts?npc.parts:(npc||{}),role=roleForVariant(p.variant??npc?.variant),ctx=context||{},mem=memory||{};
 const contextual=contextualLines(role,ctx),recent=new Set(Array.isArray(mem.recentTopics)?mem.recentTopics:[]);
 const fresh=contextual.filter(x=>!recent.has(x.topic));
 let selected=null;
 if(fresh.length&&rand(random)<((ctx.enemyNearby||ctx.healthLow||ctx.night||ctx.onShip)?0.86:0.72))selected=choose(fresh,random);
 if(!selected&&ctx.isWalking===true&&rand(random)<.22)selected={topic:"work",kind:"action",text:role.id==="farmer"?"Revisa el terreno y comprueba que el camino esté despejado.":role.id==="smith"?"Vuelve a la fragua; todavía queda trabajo por hacer.":"Continúa con tu tarea y mantén los ojos abiertos."};
 if(!selected)selected={topic:"daily-"+role.id,kind:rand(random)<.22?"thought":"speech",text:choose(rand(random)<.5?role.thoughts:role.speech,random)};
 return{kind:selected.kind,topic:selected.topic,roleId:role.id,roleName:role.name,text:selected.text};
}
function chooseExchange(aNpc,bNpc,random,context){
 const a=roleForVariant(aNpc&&aNpc.parts?aNpc.parts.variant:aNpc?.variant),b=roleForVariant(bNpc&&bNpc.parts?bNpc.parts.variant:bNpc?.variant),ctx=context||{};
 if(ctx.enemyNearby===true)return[{kind:"speech",topic:"danger",roleId:a.id,roleName:a.name,text:"¿Has visto movimiento junto a la empalizada?"},{kind:"speech",topic:"danger",roleId:b.id,roleName:b.name,text:"Sí. Avísales a los demás y no dejes la entrada desprotegida."}];
 if(ctx.night===true)return[{kind:"speech",topic:"night",roleId:a.id,roleName:a.name,text:"La noche está cayendo. ¿Has revisado el fuego?"},{kind:"speech",topic:"night",roleId:b.id,roleName:b.name,text:"Sí, pero mantendré la guardia. No me fío del silencio."}];
 if(ctx.onShip===true)return[{kind:"speech",topic:"voyage",roleId:a.id,roleName:a.name,text:"¿Crees que encontraremos una cala segura?"},{kind:"speech",topic:"voyage",roleId:b.id,roleName:b.name,text:"Mantén la vista en la costa. Buscaremos un lugar donde desembarcar."}];
 return[{kind:"speech",topic:"village",roleId:a.id,roleName:a.name,text:choose(OPENERS,random)},{kind:"speech",topic:"village",roleId:b.id,roleName:b.name,text:choose(b.speech,random)}];
}
function selectVisibleBubbles(items,limitValue){const requested=Number.isFinite(Number(limitValue))?Math.floor(Number(limitValue)):MAX_VISIBLE_BUBBLES,limit=Math.max(0,Math.min(MAX_VISIBLE_BUBBLES,requested));if(!Array.isArray(items)||!limit)return[];return items.filter(x=>x&&x.visible!==false&&Number.isFinite(Number(x.distance))&&Number(x.distance)<=MAX_RANGE_METERS).slice().sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0)||Number(a.distance)-Number(b.distance)).slice(0,limit);}
return Object.freeze({MAX_VISIBLE_BUBBLES,MAX_RANGE_METERS,POSITION_UPDATE_MS,SCHEDULER_INTERVAL_MS,ROLES,roleForVariant,chooseAmbientMessage,chooseExchange,selectVisibleBubbles,contextualLines});
});