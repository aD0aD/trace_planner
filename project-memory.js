/* Immutable image strings are shared; history contains metadata and image IDs only. */
(function(root){
  class ProjectMemory {
    constructor(){this.images=new Map();this.ids=new Map();this.nextId=1;}
    capture(project){
      const visit=value=>{
        if(typeof value==='string'&&value.startsWith('data:image/')){
          let id=this.ids.get(value);
          if(!id){id=String(this.nextId++);this.ids.set(value,id);this.images.set(id,value);}
          return {$traceImage:id};
        }
        if(Array.isArray(value))return value.map(visit);
        if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v)]));
        return value;
      };
      return JSON.stringify(visit(project));
    }
    references(project){
      const ids=new Set();
      const visit=value=>{
        if(!value||typeof value!=='object')return;
        if(Object.keys(value).length===1&&typeof value.$traceImage==='string'){ids.add(value.$traceImage);return;}
        Object.values(value).forEach(visit);
      };
      visit(project);return ids;
    }
    expand(project){
      const assets=project.imageAssets,canonical=new Map();
      if(assets!==undefined&&(!assets||Array.isArray(assets)||typeof assets!=='object'))throw Error('Invalid project image assets');
      const visit=value=>{
        if(value&&typeof value==='object'){
          if(Object.keys(value).length===1&&typeof value.$traceImage==='string'){
            const id=value.$traceImage,image=assets===undefined?this.images.get(id):Object.hasOwn(assets,id)?assets[id]:null;
            if(typeof image!=='string'||!image.startsWith('data:image/'))throw Error('Missing project image: '+id);
            return visit(image);
          }
          if(Array.isArray(value))return value.map(visit);
          return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v)]));
        }
        if(typeof value==='string'&&value.startsWith('data:image/')){
          if(!canonical.has(value))canonical.set(value,value);
          return canonical.get(value);
        }
        return value;
      };
      const {imageAssets,...data}=project;
      if(data.version===4){
        if(!assets||!Object.hasOwn(data,'imageSourceVersion'))throw Error('Invalid image project format');
        if(data.imageSourceVersion===null)delete data.version;else data.version=data.imageSourceVersion;
        delete data.imageSourceVersion;
      }
      return visit(data);
    }
    portable(snapshot){
      const project=JSON.parse(snapshot);
      project.imageSourceVersion=project.version??null;
      project.version=4; // Older applications must reject this format instead of silently losing images.
      project.imageAssets=Object.fromEntries([...this.references(project)].map(id=>[id,this.images.get(id)]));
      return project;
    }
    // Conservative UTF-8 upper bound, without allocating an image-sized JSON or Blob.
    storageUpperBound(snapshot){
      return snapshot.length*3+256+[...this.references(JSON.parse(snapshot))].reduce((n,id)=>n+this.images.get(id).length+id.length+8,0);
    }
    retainedBytes(snapshots){
      const ids=new Set();let bytes=0;
      for(const snapshot of snapshots){bytes+=snapshot.length*2;for(const id of this.references(JSON.parse(snapshot)))ids.add(id);}
      for(const id of ids)bytes+=this.images.get(id).length*2;
      return bytes;
    }
    prune(snapshots){
      const keep=new Set();
      for(const snapshot of snapshots)for(const id of this.references(JSON.parse(snapshot)))keep.add(id);
      for(const [id,image] of this.images)if(!keep.has(id)){this.images.delete(id);this.ids.delete(image);}
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=ProjectMemory;
  else root.ProjectMemory=ProjectMemory;
})(globalThis);
