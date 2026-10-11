CREATE TABLE `session_items` (
	`session_id` text NOT NULL,
	`position` integer NOT NULL,
	`problem_id` text NOT NULL,
	`hints_revealed` integer DEFAULT 0 NOT NULL,
	`outcome` text,
	`attempt_id` text,
	`credit` real,
	`resolved_at` integer,
	PRIMARY KEY(`session_id`, `position`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`subjects` text NOT NULL,
	`min_difficulty` integer NOT NULL,
	`max_difficulty` integer NOT NULL,
	`size` integer NOT NULL,
	`started_by` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`end_reason` text,
	`score` real
);
--> statement-breakpoint
ALTER TABLE `attempts` ADD `session_id` text REFERENCES sessions(id);--> statement-breakpoint
ALTER TABLE `attempts` ADD `hints_used` integer DEFAULT 0 NOT NULL;