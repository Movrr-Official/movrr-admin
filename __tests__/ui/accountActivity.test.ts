import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach,describe,it,expect,vi } from 'vitest';
import { createTable,getCoreRowModel,getSortedRowModel,getPaginationRowModel } from '@tanstack/react-table';
import { getUsersTableColumns } from '@/components/users/UsersTableColumns';
import type { User } from '@/schemas';
const user=(id:string,extra:Partial<User>={})=>({id,name:id,email:`${id}@example.test`,status:'active',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',isVerified:false,languagePreference:'en',...extra}) as User;
const columns=getUsersTableColumns({} as Parameters<typeof getUsersTableColumns>[0]);
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('Last Active table contract',()=>{
 it('sorts instants rather than offset strings before pagination; unknown values remain last in either direction',()=>{
  for(const desc of [false,true]){
   const table=createTable<User>({data:[user('null'),user('older',{lastActive:'2026-01-01T12:00:00+02:00'}),user('newer',{lastActive:'2026-01-01T11:00:00Z'})],columns,
    state:{sorting:[{id:'lastActive',desc}],pagination:{pageIndex:0,pageSize:2}},onStateChange:()=>{},renderFallbackValue:null,
    getCoreRowModel:getCoreRowModel(),getSortedRowModel:getSortedRowModel(),getPaginationRowModel:getPaginationRowModel()});
   expect(table.getSortedRowModel().rows.map(r=>r.id)).toHaveLength(3);
   expect(table.getRowModel().rows.map(r=>r.original.id)).toEqual(desc?['newer','older']:['older','newer']);
  }
 });
 it('distinguishes unavailable and no recorded activity; formats offset timestamps relative to the current instant',()=>{
  vi.stubGlobal('React',React);vi.useFakeTimers();vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  const column=columns.find(c=>c.id==='lastActive')!;
  const render=(u:User)=>renderToStaticMarkup((column.cell as Function)({row:{original:u}}));
  expect(render(user('null'))).toContain('No recorded activity');
  expect(render(user('offline',{activityAvailable:false}))).toContain('Unavailable');
  expect(render(user('seen',{lastActive:'2026-01-01T12:55:00+01:00'}))).toContain('5 minutes ago');
  vi.setSystemTime(new Date('2026-01-01T12:05:00Z'));
  expect(render(user('seen',{lastActive:'2026-01-01T12:55:00+01:00'}))).toContain('10 minutes ago');
 });
});
