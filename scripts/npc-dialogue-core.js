(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.ELSN_NPC_DIALOGUE_CORE=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const MAX_VISIBLE_BUBBLES=4,MAX_RANGE_METERS=26,POSITION_UPDATE_MS=100,SCHEDULER_INTERVAL_MS=1200;
const ROLES=Object.freeze([
 Object.freeze({id:"fisher",name:"Pescador",focus:"mareas, redes, corrientes y calas",thoughts:["La marea está cambiando; habrá que revisar las redes.","El mar siempre encuentra la forma de sorprendernos."],speech:["Hoy las redes pesan poco.","Cuando cambie el viento, saldré a pescar.","Necesitamos más cuerda para las redes."]}),
 Object.freeze({id:"farmer",name:"Campesino",focus:"cosechas, agua, alimentos y reservas",thoughts:["La tierra necesita cuidados antes de la próxima cosecha.","No podemos desperdiciar ni una sola provisión."],speech:["Hoy toca revisar los cultivos.","La cosecha saldrá adelante si cuidamos la tierra.","Las provisiones deben durar hasta la próxima estación."]}),
 Object.freeze({id:"smith",name:"Herrero",focus:"hierro, herramientas, reparaciones y defensas",thoughts:["Una buena hoja necesita paciencia y buen fuego.","El hierro de esta isla exige un trabajo cuidadoso."],speech:["La fragua necesita más carbón.","Me vendría bien recibir más mineral.","Cada herramienta debe aguantar muchos inviernos."]}),
 Object.freeze({id:"trader",name:"Mercader",focus:"intercambios, rutas, noticias y provisiones",thoughts:["Los rumores viajan más rápido que los barcos.","Conviene guardar algo para los días difíciles."],speech:["Siempre hay algo que intercambiar en otra isla.","Ojalá llegue pronto un barco mercante.","Una ruta segura puede traer noticias y provisiones."]})
]);
const OPENERS=["¿Has oído algo nuevo de la costa?","¿Cómo marcha el trabajo hoy?","¿Crees que tendremos una travesía tranquila?","¿Has visto al resto del poblado esta mañana?"];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
function rand(r){const n=typeof r==="function"?Number(r()):Math.random();return Number.isFinite(n)?Math.max(0,Math.min(.999999,n)):.5;}
function choose(a,r){return a[Math.floor(rand(r)*a.length)];}
function roleForVariant(v){return ROLES[Math.abs(Math.floor(Number(v)||0))%ROLES.length];}
function hasMeasuredNumber(value){return value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));}
function contextualLines(role,ctx){
 const lines=[];
 if(ctx.enemyNearby===true)lines.push({topic:"danger",kind:"speech",text:role.id==="fisher"?"¡Hay saqueadores cerca! No te quedes junto a la costa.":"¡He visto enemigos cerca del poblado! Mantén el arma preparada."});
 if(ctx.healthLow===true)lines.push({topic:"health",kind:"speech",text:"Estás herido. Busca un lugar seguro y recupera fuerzas antes de volver a luchar."});
 if(ctx.night===true)lines.push({topic:"night",kind:"speech",text:role.id==="farmer"?"Está anocheciendo. Será mejor asegurar el poblado y no alejarse de la luz.":role.id==="fisher"?"Con esta oscuridad no saldría a navegar sin revisar antes la costa.":"La noche cubre los caminos. Vigila los alrededores y mantente cerca del fuego."});
 if(ctx.onShip===true)lines.push({topic:"voyage",kind:"speech",text:role.id==="fisher"?"Vigila el viento y los bajíos. Una mala maniobra puede abrir el casco.":role.id==="trader"?"Cada isla puede guardar provisiones, pero primero hay que encontrar un desembarco seguro.":"No pierdas de vista la costa; desde el barco los arrecifes engañan."});
 if(hasMeasuredNumber(ctx.wood)&&Number(ctx.wood)<=5)lines.push({topic:"wood",kind:"speech",text:role.id==="smith"?"Nos queda poca madera para reparar herramientas y defensas.":"Las reservas de madera son escasas. Conviene talar cerca del campamento."});
 if(hasMeasuredNumber(ctx.stone)&&Number(ctx.stone)<=5)lines.push({topic:"stone",kind:"speech",text:role.id==="smith"?"Nos falta piedra para reforzar el equipo. Busca un afloramiento de granito y usa el pico.":"Queda poca piedra. Los bloques de granito de la isla pueden servirnos."});
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
function buildConversation(topic,a,b,ctx,random,memory){
 const island=ctx.islandName?(" en "+String(ctx.islandName).slice(0,36)):"",rapport=clamp(memory&&memory.rapport||0,0,5),friendly=rapport>=2;
 const line=(role,text)=>({kind:"speech",topic,roleId:role.id,roleName:role.name,text});
 if(topic==="danger")return[
  line(a,a.id==="fisher"?"He visto movimiento cerca de la costa. ¿Tú también?":"Hay enemigos cerca de la empalizada. ¿Has dado la voz de alarma?"),
  line(b,b.id==="trader"?"Sí. Avisaré al poblado y buscaré una ruta segura para retirarnos.":b.id==="smith"?"Sí. Llevaré herramientas y reforzaré la entrada.":"Sí. Voy a avisar a la guardia; no debemos dejar ese paso descubierto."),
  line(a,friendly?"Bien. Confío en ti; yo vigilaré el otro lado.":"De acuerdo. Yo cubriré el flanco mientras avisas a los demás.")
 ];
 if(topic==="health")return[
  line(a,"Ese golpe ha sido serio. ¿Tienes vendas y un lugar donde descansar?"),
  line(b,b.id==="farmer"?"Prepararé agua y algo de comida. No puedes seguir trabajando así.":"Buscaré un sitio junto al fuego. Primero hay que recuperarse y después volveremos al trabajo."),
  line(a,"Avísame cuando esté mejor; no merece la pena perder a otro compañero.")
 ];
 if(topic==="night")return[
  line(a,a.id==="farmer"?"La luz está cayendo. ¿Quién se encarga del fuego esta noche?":"La noche se ha cerrado sobre el poblado. ¿Has revisado la empalizada?"),
  line(b,b.id==="fisher"?"Dejaré las redes y ayudaré con la guardia. La costa puede esperar.":b.id==="smith"?"Yo revisaré las defensas; el fuego debe mantenerse encendido.":"Haré el primer turno. Despiértame cuando llegue el relevo."),
  line(a,friendly?"Gracias. Mañana te guardaré una parte de las provisiones.":"De acuerdo. Mantengamos el poblado seguro hasta el amanecer.")
 ];
 if(topic==="voyage")return[
  line(a,"¿Qué ruta tomarías para llegar a la siguiente isla sin arriesgar el barco?"),
  line(b,b.id==="fisher"?"Sigamos la costa y evitemos los bajíos cuando cambie la marea.":b.id==="trader"?"Primero busquemos una cala protegida; después podremos comerciar con el poblado.":"Conviene reparar el casco y asegurar las herramientas antes de zarpar."),
  line(a,"Buena idea. Comprobaremos el viento y prepararemos la carga antes de partir.")
 ];
 if(topic==="resources")return[
  line(a,a.id==="smith"?"Nos falta material para reparar el equipo. ¿Qué podemos conseguir primero?":"Las reservas están bajando. ¿Cómo organizamos el trabajo?"),
  line(b,b.id==="fisher"?"Puedo traer pescado para cambiarlo por madera y piedra.":b.id==="farmer"?"Prioricemos comida y madera; sin reservas no aguantaremos el invierno.":"Puedo organizar un intercambio en la próxima ruta, pero necesitamos escolta."),
  line(a,"Repartamos las tareas y revisemos las reservas al volver.")
 ];
 if(topic==="capture")return[
  line(a,"La bandera ya ondea"+island+". ¿Crees que podremos mantener este asentamiento?"),
  line(b,b.id==="smith"?"Reforzaremos la empalizada y repararemos las herramientas.":b.id==="farmer"?"Sí, si aseguramos agua y alimentos antes de que llegue el frío.":"Sí, pero habrá que abrir una ruta segura para traer provisiones."),
  line(a,"Entonces manos a la obra. Esta vez construiremos algo que dure.")
 ];
 if(topic==="work")return[
  line(a,"¿Cómo va tu tarea? Parece que hoy no paramos."),
  line(b,b.id==="fisher"?"Las redes están listas; después puedo ayudar con el transporte.":b.id==="farmer"?"Voy a terminar aquí y luego revisaré las reservas.":b.id==="smith"?"Las herramientas estarán listas cuando termine de templar el hierro.":"Estoy organizando los materiales para que nadie tenga que esperar."),
  line(a,friendly?"Perfecto. Trabajar contigo hace más fácil la jornada.":"Bien. Cuando acabes, coordinamos el siguiente trabajo.")
 ];
 return[
  line(a,choose(OPENERS,random)),
  line(b,b.id===a.id?choose(b.speech,random):b.id==="fisher"?"El viento está cambiando; mejor revisar las redes antes de que suba la marea.":b.id==="farmer"?"Con buenas reservas, el poblado puede pasar el invierno.":b.id==="smith"?"Una herramienta bien hecha ahorra muchos problemas.":"Las noticias de otras islas pueden valer tanto como el oro."),
  line(a,friendly?"Siempre es bueno hablar contigo. Nos entendemos mejor cada día.":"Tendremos que compartir noticias cuando vuelva el resto de la expedición.")
 ];
}
function chooseExchange(aNpc,bNpc,random,context,memory){
 const a=roleForVariant(aNpc&&aNpc.parts?aNpc.parts.variant:aNpc?.variant),b=roleForVariant(bNpc&&bNpc.parts?bNpc.parts.variant:bNpc?.variant),ctx=context||{},mem=memory||{};
 const candidates=[];
 if(ctx.enemyNearby===true)candidates.push("danger");
 if(ctx.healthLow===true)candidates.push("health");
 if(ctx.recentCapture===true)candidates.push("capture");
 if(ctx.night===true)candidates.push("night");
 if(ctx.onShip===true)candidates.push("voyage");
 if((hasMeasuredNumber(ctx.wood)&&Number(ctx.wood)<=5)||(hasMeasuredNumber(ctx.stone)&&Number(ctx.stone)<=5))candidates.push("resources");
 if(ctx.isWalking===true)candidates.push("work");
 candidates.push("village");
 const recent=new Set(Array.isArray(mem.recentTopics)?mem.recentTopics:[]);
 const topic=candidates.find(value=>!recent.has(value))||candidates[candidates.length-1];
 return buildConversation(topic,a,b,ctx,random,mem);
}
function selectVisibleBubbles(items,limitValue){const requested=Number.isFinite(Number(limitValue))?Math.floor(Number(limitValue)):MAX_VISIBLE_BUBBLES,limit=Math.max(0,Math.min(MAX_VISIBLE_BUBBLES,requested));if(!Array.isArray(items)||!limit)return[];return items.filter(x=>x&&x.visible!==false&&Number.isFinite(Number(x.distance))&&Number(x.distance)<=MAX_RANGE_METERS).slice().sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0)||Number(a.distance)-Number(b.distance)).slice(0,limit);}
return Object.freeze({MAX_VISIBLE_BUBBLES,MAX_RANGE_METERS,POSITION_UPDATE_MS,SCHEDULER_INTERVAL_MS,ROLES,roleForVariant,chooseAmbientMessage,chooseExchange,selectVisibleBubbles,contextualLines});
});