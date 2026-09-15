import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const journeySessions=sqliteTable('journey_sessions',{
 userId:text('user_id').primaryKey(),version:integer('version').notNull(),snapshot:text('snapshot').notNull(),updatedAt:integer('updated_at').notNull()
});
export const timetableCache=sqliteTable('timetable_cache',{id:integer('id').primaryKey(),payload:text('payload').notNull(),checkedAt:integer('checked_at').notNull()});
export const privateProfiles=sqliteTable('private_profiles',{id:text('id').primaryKey(),payload:text('payload').notNull(),updatedAt:integer('updated_at').notNull()});
export const notificationDevices=sqliteTable('notification_devices',{
 token:text('token').primaryKey(),userId:text('user_id').notNull(),platform:text('platform').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
},table=>[index('idx_notification_devices_user_id').on(table.userId)]);
export const notificationDeliveries=sqliteTable('notification_deliveries',{
 eventKey:text('event_key').primaryKey(),userId:text('user_id').notNull(),createdAt:integer('created_at').notNull()
},table=>[index('idx_notification_deliveries_user_id').on(table.userId)]);
