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
    version = 2,
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
            ).addCallback(object : Callback() {
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
