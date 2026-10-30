export const retainEqual=<T,>(current:T,next:T):T=>{if(Object.is(current,next))return current;try{return JSON.stringify(current)===JSON.stringify(next)?current:next}catch{return next}};
