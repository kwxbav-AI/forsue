-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "store_name" TEXT NOT NULL,
    "region" TEXT,
    "manager_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_targets" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "sales_target" DECIMAL(14,2) NOT NULL,
    "labor_hour_target" DECIMAL(10,2) NOT NULL,
    "rplh_target" DECIMAL(12,4),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_store_performance" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sales_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "customer_count" INTEGER NOT NULL DEFAULT 0,
    "avg_order_value" DECIMAL(12,2),
    "total_labor_hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "overtime_hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "leave_hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "weather" TEXT,
    "event_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_store_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tms_transactions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "transaction_time" TIMESTAMP(3) NOT NULL,
    "order_no" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tms_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_schedules" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "staff_name" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "position" TEXT,
    "is_manager" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_store_name_key" ON "stores"("store_name");

-- CreateIndex
CREATE UNIQUE INDEX "store_targets_store_id_year_month_key" ON "store_targets"("store_id", "year", "month");

-- CreateIndex
CREATE INDEX "store_targets_year_month_idx" ON "store_targets"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "daily_store_performance_store_id_date_key" ON "daily_store_performance"("store_id", "date");

-- CreateIndex
CREATE INDEX "daily_store_performance_date_idx" ON "daily_store_performance"("date");

-- CreateIndex
CREATE INDEX "tms_transactions_store_id_transaction_time_idx" ON "tms_transactions"("store_id", "transaction_time");

-- CreateIndex
CREATE INDEX "staff_schedules_store_id_work_date_idx" ON "staff_schedules"("store_id", "work_date");

-- AddForeignKey
ALTER TABLE "store_targets" ADD CONSTRAINT "store_targets_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_store_performance" ADD CONSTRAINT "daily_store_performance_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tms_transactions" ADD CONSTRAINT "tms_transactions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
