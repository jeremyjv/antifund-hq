import {z} from 'zod';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const id=z.string().regex(/^[a-z0-9][a-z0-9_-]{0,100}$/);
const text=z.string().trim().min(1);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/).refine(value=>!Number.isNaN(Date.parse(value)),'Invalid date');
const publicationDate=z.union([date,z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)]);
const refs=z.array(id).min(1);
const sourceSchema=z.object({id,title:text,url:z.url().refine(v=>v.startsWith('https://')),publisher:text,publishedAt:publicationDate.nullable(),checkedAt:date});
const companySchema=z.object({id,name:text,domain:text,sector:text,stage:text.nullable(),relationship:z.enum(['portfolio','research']),summary:text,bottleneck:text,thesisFit:text,sourceIds:refs,tags:z.array(text),questions:z.array(text).min(1),risks:z.array(text).min(1)});
const signalSchema=z.object({id,companyId:id,title:text,summary:text,sourceIds:refs,observedAt:date.nullable(),kind:text});
const briefSchema=z.object({id,title:text,subtitle:text,bottleneck:text,summary:text,companyIds:refs,sourceIds:refs,sections:z.array(z.object({title:text,body:text,sourceIds:refs})).min(1),questions:z.array(text).min(1),counterpoints:z.array(text).min(1)});
const thesisSchema=z.object({id,title:text,summary:text,bottleneck:text,companyIds:refs,sourceIds:refs,questions:z.array(text).min(1)});
export const seedSchema=z.object({checkedAt:date,sources:z.array(sourceSchema).min(1),companies:z.array(companySchema).min(1),signals:z.array(signalSchema),briefs:z.array(briefSchema).min(1),theses:z.array(thesisSchema).min(1),marketMetrics:z.array(z.object({companyId:id,theme:text,amountM:z.number().positive(),lowerBound:z.boolean(),round:text,sourceIds:refs,focus:text,nextQuestion:text})).optional()});

export function validateSeed(input){
  const data=seedSchema.parse(input);
  for(const group of ['sources','companies','signals','briefs','theses']){
    if(new Set(data[group].map(item=>item.id)).size!==data[group].length)throw new Error(`Duplicate ${group} IDs`);
  }
  const sources=new Set(data.sources.map(source=>source.id));
  const companies=new Set(data.companies.map(company=>company.id));
  const assertRefs=(values,index,label)=>{for(const value of values)if(!index.has(value))throw new Error(`${label}: unresolved ${value}`);};
  for(const record of [...data.companies,...data.signals,...data.briefs,...data.theses]){
    assertRefs(record.sourceIds,sources,record.id);
    if(record.companyId)assertRefs([record.companyId],companies,record.id);
    if(record.companyIds)assertRefs(record.companyIds,companies,record.id);
    for(const section of record.sections||[])assertRefs(section.sourceIds,sources,record.id);
  }
  for(const metric of data.marketMetrics||[]){
    assertRefs(metric.sourceIds,sources,metric.companyId);
    if(!data.companies.some(c=>c.id===metric.companyId && c.relationship==='research'))throw new Error('Market candidate must be research: '+metric.companyId);
  }
  for(const company of data.companies.filter(c=>c.relationship==='portfolio')){
    if(!company.sourceIds.some(s=>new URL(data.sources.find(source=>source.id===s).url).hostname==='antifund.com'))throw new Error(`${company.id}: portfolio membership needs Anti Fund attribution`);
  }
  for(const source of data.sources){
    if(source.publishedAt&&Date.parse(source.publishedAt)>Date.parse(source.checkedAt)+86400000)throw new Error(`${source.id}: publication after check date`);
  }
  return data;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const data=validateSeed(JSON.parse(await readFile('data/research-seed.json','utf8')));
  console.log(`Seed validated: ${data.companies.length} companies, ${data.sources.length} sources, ${data.signals.length} observations, ${data.briefs.length} briefs.`);
}
