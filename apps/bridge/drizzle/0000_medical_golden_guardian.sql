CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`problem_id` text NOT NULL,
	`answer_given` text NOT NULL,
	`correct` integer NOT NULL,
	`seconds_spent` real NOT NULL,
	`tools_used` text NOT NULL,
	`agent_state_at_start` text NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `flags` (
	`id` text PRIMARY KEY NOT NULL,
	`problem_id` text NOT NULL,
	`reason` text NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `problems` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`subject` text NOT NULL,
	`topic` text NOT NULL,
	`difficulty` integer NOT NULL,
	`type` text NOT NULL,
	`statement` text NOT NULL,
	`tools` text NOT NULL,
	`answer` text NOT NULL,
	`verification_status` text DEFAULT 'unverified' NOT NULL,
	`source` text,
	`statement_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
