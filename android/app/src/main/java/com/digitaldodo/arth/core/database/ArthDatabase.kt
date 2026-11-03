package com.digitaldodo.arth.core.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.UUID

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
    version = 1,
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
                    // Prepopulate standard categories on database creation
                    CoroutineScope(Dispatchers.IO).launch {
                        val dao = getInstance(context).categoryDao()
                        dao.insertAll(DEFAULT_CATEGORIES)
                    }
                }
            }).fallbackToDestructiveMigration().build()
        }

        val DEFAULT_CATEGORIES = listOf(
            CategoryEntity("cat-food", "Food & Dining", "restaurant", "#F59E0B", "EXPENSE", true, 1),
            CategoryEntity("cat-groceries", "Groceries", "shopping_cart", "#10B981", "EXPENSE", true, 2),
            CategoryEntity("cat-transport", "Transportation", "commute", "#3B82F6", "EXPENSE", true, 3),
            CategoryEntity("cat-utilities", "Bills & Utilities", "receipt_long", "#EF4444", "EXPENSE", true, 4),
            CategoryEntity("cat-shopping", "Shopping", "storefront", "#8B5CF6", "EXPENSE", true, 5),
            CategoryEntity("cat-housing", "Housing & Rent", "home", "#6366F1", "EXPENSE", true, 6),
            CategoryEntity("cat-health", "Health & Medical", "medical_services", "#EC4899", "EXPENSE", true, 7),
            CategoryEntity("cat-entertainment", "Entertainment", "movie", "#14B8A6", "EXPENSE", true, 8),
            CategoryEntity("cat-education", "Education", "school", "#F97316", "EXPENSE", true, 9),
            CategoryEntity("cat-salary", "Salary & Income", "payments", "#10B981", "INCOME", true, 10),
            CategoryEntity("cat-freelance", "Freelance & Consulting", "work", "#3B82F6", "INCOME", true, 11),
            CategoryEntity("cat-investments", "Investment Returns", "trending_up", "#8B5CF6", "INCOME", true, 12),
            CategoryEntity("cat-misc-expense", "Other Expense", "more_horiz", "#78716C", "EXPENSE", true, 98),
            CategoryEntity("cat-misc-income", "Other Income", "add_circle", "#78716C", "INCOME", true, 99)
        )
    }
}
