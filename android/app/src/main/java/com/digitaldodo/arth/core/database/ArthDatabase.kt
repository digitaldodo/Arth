package com.digitaldodo.arth.core.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@Database(
    entities = [
        TransactionEntity::class,
        CategoryEntity::class,
        AccountBalancesEntity::class,
        PersonEntity::class,
        PersonTransactionEntity::class,
        SmsSuggestionEntity::class,
        SyncOutboxEntity::class
    ],
    version = 4,
    exportSchema = false
)
abstract class ArthDatabase : RoomDatabase() {
    abstract fun transactionDao(): TransactionDao
    abstract fun categoryDao(): CategoryDao
    abstract fun accountBalancesDao(): AccountBalancesDao
    abstract fun personDao(): PersonDao
    abstract fun personTransactionDao(): PersonTransactionDao
    abstract fun smsSuggestionDao(): SmsSuggestionDao
    abstract fun syncOutboxDao(): SyncOutboxDao

    companion object {
        @Volatile
        private var INSTANCE: ArthDatabase? = null

        val MIGRATION_2_3 = object : androidx.room.migration.Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE sms_suggestions ADD COLUMN bank TEXT")
                db.execSQL("ALTER TABLE sms_suggestions ADD COLUMN accountMask TEXT")
                db.execSQL("ALTER TABLE sms_suggestions ADD COLUMN classification TEXT NOT NULL DEFAULT 'DEBIT'")
                db.execSQL("ALTER TABLE sms_suggestions ADD COLUMN balancePaise INTEGER")
                db.execSQL("ALTER TABLE sms_suggestions ADD COLUMN duplicateStatus TEXT NOT NULL DEFAULT 'UNIQUE'")
                db.execSQL("ALTER TABLE sms_suggestions ADD COLUMN matchedTransactionId TEXT")
                db.execSQL("ALTER TABLE sms_suggestions ADD COLUMN rawSnippet TEXT")
                db.execSQL("CREATE INDEX IF NOT EXISTS idx_sms_status ON sms_suggestions(status)")
                db.execSQL("CREATE INDEX IF NOT EXISTS idx_sms_ref ON sms_suggestions(refNumber)")
            }
        }

        val MIGRATION_3_4 = object : androidx.room.migration.Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE transactions ADD COLUMN ingestionSource TEXT NOT NULL DEFAULT 'manual'")
                db.execSQL("ALTER TABLE transactions ADD COLUMN statementReference TEXT")
                db.execSQL("ALTER TABLE transactions ADD COLUMN accountId TEXT")
                db.execSQL("ALTER TABLE transactions ADD COLUMN importBatchId TEXT")
                db.execSQL("ALTER TABLE transactions ADD COLUMN parserVersion TEXT")
                db.execSQL("ALTER TABLE transactions ADD COLUMN categorizationModelVersion TEXT")
                db.execSQL("ALTER TABLE transactions ADD COLUMN categoryVerified INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE transactions ADD COLUMN categorizationMethod TEXT")
                db.execSQL("ALTER TABLE transactions ADD COLUMN categorySuggestionConfidence REAL")
                db.execSQL("ALTER TABLE transactions ADD COLUMN categoryEvidence TEXT")
                db.execSQL("ALTER TABLE transactions ADD COLUMN categoryWasCorrected INTEGER NOT NULL DEFAULT 0")
            }
        }

        fun getInstance(context: Context): ArthDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context.applicationContext).also { INSTANCE = it }
            }
        }

        private fun buildDatabase(context: Context): ArthDatabase {
            return Room.databaseBuilder(
                context,
                ArthDatabase::class.java,
                "arth_native.db"
            ).addMigrations(MIGRATION_2_3, MIGRATION_3_4)
            .addCallback(object : Callback() {
                override fun onCreate(db: SupportSQLiteDatabase) {
                    super.onCreate(db)
                    CoroutineScope(Dispatchers.IO).launch {
                        val dao = getInstance(context).categoryDao()
                        dao.insertAll(DEFAULT_CATEGORIES)
                    }
                }
            }).fallbackToDestructiveMigration().build()
        }

        // Canonical default categories matching supabase/migrations/0006_auth_trigger.sql
        val DEFAULT_CATEGORIES = listOf(
            CategoryEntity("cat-food-dining", "Food & Dining", "🍽️", "#3B82F6", "EXPENSE", true, 1),
            CategoryEntity("cat-transport", "Transport", "🚗", "#3B82F6", "EXPENSE", true, 2),
            CategoryEntity("cat-housing", "Housing", "🏠", "#3B82F6", "EXPENSE", true, 3),
            CategoryEntity("cat-utilities", "Utilities", "⚡", "#3B82F6", "EXPENSE", true, 4),
            CategoryEntity("cat-healthcare", "Healthcare", "💊", "#3B82F6", "EXPENSE", true, 5),
            CategoryEntity("cat-entertainment", "Entertainment", "🎬", "#3B82F6", "EXPENSE", true, 6),
            CategoryEntity("cat-shopping", "Shopping", "🛍️", "#3B82F6", "EXPENSE", true, 7),
            CategoryEntity("cat-education", "Education", "📚", "#3B82F6", "EXPENSE", true, 8),
            CategoryEntity("cat-personal-care", "Personal Care", "💈", "#3B82F6", "EXPENSE", true, 9),
            CategoryEntity("cat-travel", "Travel", "✈️", "#3B82F6", "EXPENSE", true, 10),
            CategoryEntity("cat-other-expense", "Other Expense", "🧾", "#3B82F6", "EXPENSE", true, 11),
            CategoryEntity("cat-salary", "Salary", "💼", "#10B981", "INCOME", true, 1),
            CategoryEntity("cat-freelance", "Freelance", "💻", "#10B981", "INCOME", true, 2),
            CategoryEntity("cat-investments", "Investments", "📈", "#10B981", "INCOME", true, 3),
            CategoryEntity("cat-other-income", "Other Income", "💵", "#10B981", "INCOME", true, 4)
        )
    }
}
