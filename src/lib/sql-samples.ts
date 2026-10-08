// Mẫu SQL (mã, không phải chuỗi giao diện) — nhãn hiển thị lấy từ i18n `ui.samples.<id>`.
// Mẫu trung tính về dialect để cú pháp hợp lệ với hầu hết dialect.

export const SQL_SAMPLE_IDS = ['select', 'join', 'cte', 'insert', 'createTable', 'multi', 'broken'] as const;
export type SqlSampleId = (typeof SQL_SAMPLE_IDS)[number];

export const SQL_SAMPLES: Record<SqlSampleId, string> = {
	select: `select id, name, email from users where active = 1 and created_at > '2024-01-01' order by name limit 20;`,
	join: `select o.id, c.name as customer, sum(oi.quantity * oi.price) as total from orders o inner join customers c on c.id = o.customer_id left join order_items oi on oi.order_id = o.id where o.status in ('paid', 'shipped') and o.created_at >= '2024-01-01' group by o.id, c.name having sum(oi.quantity * oi.price) > 100 order by total desc;`,
	cte: `with recent_orders as (select customer_id, count(*) as order_count from orders where created_at >= '2024-01-01' group by customer_id), top_customers as (select customer_id from recent_orders where order_count >= 5) select c.id, c.name, r.order_count from customers c join recent_orders r on r.customer_id = c.id where c.id in (select customer_id from top_customers) order by r.order_count desc;`,
	insert: `insert into products (name, price, stock) values ('Keyboard', 49.90, 120), ('Mouse', 19.50, 300);
update products set price = price * 1.1, stock = stock - 1 where name = 'Keyboard' and stock > 0;`,
	createTable: `create table employees (id integer primary key, full_name varchar(100) not null, email varchar(255) unique, department_id integer references departments (id), salary decimal(10, 2) default 0, hired_at date);`,
	multi: `-- Orders report
select count(*) from orders where note = 'a;b';
/* cleanup ; old rows */
delete from sessions where expires_at < now();
select 1;`,
	broken: `select id, name,
from users
where (active = 1 and role = 'admin'
order by name;
select * frm orders;`,
};
